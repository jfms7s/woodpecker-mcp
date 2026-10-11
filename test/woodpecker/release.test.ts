import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PAGES,
  PAGE_SIZE,
  RELEASE_TAG_PATTERN,
  defaultBranchOf,
  findReleaseRuns,
  previewRelease,
  releaseMessage,
} from '../../src/woodpecker/release.js';
import { fakeClient, pipeline, repo } from './fixtures.js';

const fullPage = (from: number) => Array.from({ length: PAGE_SIZE }, (_, i) => pipeline({ number: from + i }));

describe('RELEASE_TAG_PATTERN', () => {
  it.each(['v1.2.3', 'v10.0.12', 'v0.0.0'])('accepts %s', (tag) => expect(RELEASE_TAG_PATTERN.test(tag)).toBe(true));
  it.each(['1.2.3', 'v1.2', 'v1.2.3-rc1', ' v1.2.3', 'v1.2.3 ', 'latest'])('rejects %j', (tag) =>
    expect(RELEASE_TAG_PATTERN.test(tag)).toBe(false),
  );
});

describe('releaseMessage', () => {
  it('matches the poller', () => expect(releaseMessage('v1.2.3')).toBe('release v1.2.3'));
});

describe('defaultBranchOf', () => {
  it('refuses a repo with no default branch', () => {
    expect(() => defaultBranchOf({ ...repo, default_branch: undefined })).toThrow(
      'Woodpecker reports no default branch for jfms7s/budget-manager',
    );
  });
});

describe('findReleaseRuns', () => {
  it('pages through manual pipelines until a short page, keeping only that tag', async () => {
    const listPipelines = vi
      .fn()
      .mockResolvedValueOnce(fullPage(100))
      .mockResolvedValueOnce([
        pipeline({ number: 7, variables: { RELEASE_TAG: 'v1.2.3' } }),
        pipeline({ number: 6, variables: { RELEASE_TAG: 'v1.2.30' } }),
      ]);
    const runs = await findReleaseRuns(fakeClient({ listPipelines }), repo, 'v1.2.3');
    expect(runs.map((p) => p.number)).toEqual([7]);
    expect(listPipelines).toHaveBeenNthCalledWith(1, 7, { event: 'manual', page: 1, perPage: PAGE_SIZE });
    expect(listPipelines).toHaveBeenNthCalledWith(2, 7, { event: 'manual', page: 2, perPage: PAGE_SIZE });
    expect(listPipelines).toHaveBeenCalledTimes(2);
  });

  it(`stops after ${MAX_PAGES} pages`, async () => {
    const listPipelines = vi.fn(async () => fullPage(1));
    await findReleaseRuns(fakeClient({ listPipelines }), repo, 'v1.2.3');
    expect(listPipelines).toHaveBeenCalledTimes(MAX_PAGES);
  });
});

describe('previewRelease', () => {
  it('lists earlier runs of the tag and starts nothing', async () => {
    const client = fakeClient({
      listPipelines: vi.fn(async () => [pipeline({ number: 12, status: 'success', variables: { RELEASE_TAG: 'v1.2.3' } })]),
    });
    const preview = await previewRelease(client, repo, 'v1.2.3');
    expect(preview).toMatchObject({
      started: false,
      confirmRequired: true,
      repo: 'jfms7s/budget-manager',
      branch: 'main',
      tag: 'v1.2.3',
      previousRuns: [{ number: 12, status: 'success', created: '2025-10-09T08:53:20.000Z' }],
    });
    expect(preview.note).toMatch(/confirm=true/);
    expect(preview.note).toMatch(/already has 1 release run/);
    expect(client.createPipeline).not.toHaveBeenCalled();
    expect(client.restartPipeline).not.toHaveBeenCalled();
  });
});
