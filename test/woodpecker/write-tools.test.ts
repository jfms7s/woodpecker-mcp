import { describe, expect, it, vi } from 'vitest';
import { WoodpeckerApiError } from '../../src/http/errors.js';
import type { WoodpeckerClient } from '../../src/woodpecker/client.js';
import { createRepoResolver } from '../../src/woodpecker/repos.js';
import { createWriteTools } from '../../src/woodpecker/write-tools.js';
import { caller, fakeClient, pipeline } from './fixtures.js';

function setup(overrides: Partial<WoodpeckerClient>) {
  const client = fakeClient(overrides);
  return { client, call: caller(createWriteTools(client, createRepoResolver(client))) };
}

const REPO = 'jfms7s/budget-manager';
const status = (code: number) =>
  vi.fn(async () => {
    throw new WoodpeckerApiError({ method: 'POST', path: '/api/repos/7/pipelines', status: code, detail: 'x' });
  });

describe('write tools', () => {
  it('registers six write tools with the agreed destructive hints', () => {
    const tools = createWriteTools(fakeClient(), createRepoResolver(fakeClient()));
    expect(Object.fromEntries(tools.map((t) => [t.name, t.annotations.destructiveHint]))).toEqual({
      woodpecker_start_pipeline: false,
      woodpecker_restart_pipeline: true,
      woodpecker_cancel_pipeline: true,
      woodpecker_approve_pipeline: false,
      woodpecker_decline_pipeline: true,
      woodpecker_start_release: true,
    });
    expect(tools.every((t) => t.annotations.readOnlyHint === false)).toBe(true);
  });

  describe('woodpecker_start_pipeline', () => {
    it('starts the branch with options of exactly {branch}', async () => {
      const createPipeline = vi.fn(async () => pipeline({ number: 43, branch: 'feat/x' }));
      const { call } = setup({ createPipeline });
      const result = (await call('woodpecker_start_pipeline', { repo: REPO, branch: 'feat/x' })) as {
        started: boolean;
        pipeline: { number: number };
      };
      expect(createPipeline).toHaveBeenCalledWith(7, { branch: 'feat/x' });
      expect(result.started).toBe(true);
      expect(result.pipeline.number).toBe(43);
    });

    it('drops smuggled variables and never forwards them', async () => {
      const createPipeline = vi.fn(async () => pipeline());
      const { call } = setup({ createPipeline });
      await call('woodpecker_start_pipeline', {
        repo: REPO,
        branch: 'main',
        variables: { RELEASE_TAG: 'v9.9.9' },
        RELEASE_TAG: 'v9.9.9',
        event: 'tag',
      });
      expect(createPipeline).toHaveBeenCalledWith(7, { branch: 'main' });
    });

    it('reports a 204 as nothing started', async () => {
      const { call } = setup({ createPipeline: vi.fn(async () => undefined) });
      await expect(call('woodpecker_start_pipeline', { repo: REPO, branch: 'docs' })).resolves.toEqual({
        started: false,
        message: 'No workflow in jfms7s/budget-manager runs on a manual event for branch "docs"; nothing was started.',
      });
    });

    it('explains a 500 as a possibly missing branch, and a 404 as a missing branch', async () => {
      await expect(
        setup({ createPipeline: status(500) }).call('woodpecker_start_pipeline', { repo: REPO, branch: 'gone' }),
      ).rejects.toThrow(/answered 500 for branch "gone".*may not exist/);
      await expect(
        setup({ createPipeline: status(404) }).call('woodpecker_start_pipeline', { repo: REPO, branch: 'gone' }),
      ).rejects.toThrow('Woodpecker answered 404: branch "gone" was not found in jfms7s/budget-manager.');
    });
  });

  describe('woodpecker_start_release', () => {
    it('only previews without confirm: no POST', async () => {
      const { call, client } = setup({ listPipelines: vi.fn(async () => []) });
      const result = (await call('woodpecker_start_release', { repo: REPO, tag: 'v1.2.3' })) as {
        started: boolean;
        confirmRequired: boolean;
      };
      expect(result).toMatchObject({ started: false, confirmRequired: true });
      expect(client.createPipeline).not.toHaveBeenCalled();
    });

    it('with confirm, sends exactly the poller request', async () => {
      const createPipeline = vi.fn(async () => pipeline({ number: 50, variables: { RELEASE_TAG: 'v1.2.3' } }));
      const { call } = setup({ createPipeline });
      const result = (await call('woodpecker_start_release', { repo: REPO, tag: 'v1.2.3', confirm: true })) as {
        started: boolean;
        pipeline: { releaseTag: string };
      };
      expect(createPipeline).toHaveBeenCalledWith(7, {
        branch: 'main',
        variables: { RELEASE_TAG: 'v1.2.3' },
        message: 'release v1.2.3',
      });
      expect(result).toMatchObject({ started: true, pipeline: { releaseTag: 'v1.2.3' } });
    });

    it.each(['1.2.3', 'v1.2', 'v1.2.3-rc1'])('rejects tag %j before any call', async (tag) => {
      const { call, client } = setup({});
      await expect(call('woodpecker_start_release', { repo: REPO, tag, confirm: true })).rejects.toThrow();
      expect(client.lookupRepo).not.toHaveBeenCalled();
    });
  });

  describe('woodpecker_restart_pipeline', () => {
    it('restarts an ordinary pipeline', async () => {
      const restartPipeline = vi.fn(async () => pipeline({ number: 44 }));
      const { call } = setup({ getPipeline: vi.fn(async () => pipeline()), restartPipeline });
      await expect(call('woodpecker_restart_pipeline', { repo: REPO, number: 42 })).resolves.toMatchObject({
        started: true,
        restartOf: 42,
        pipeline: { number: 44 },
      });
      expect(restartPipeline).toHaveBeenCalledWith(7, 42);
    });

    it('treats a release pipeline as a release: preview without confirm', async () => {
      const { call, client } = setup({
        getPipeline: vi.fn(async () => pipeline({ variables: { RELEASE_TAG: 'v1.2.3' } })),
        listPipelines: vi.fn(async () => []),
      });
      await expect(call('woodpecker_restart_pipeline', { repo: REPO, number: 42 })).resolves.toMatchObject({
        started: false,
        confirmRequired: true,
        restartOf: 42,
        tag: 'v1.2.3',
      });
      expect(client.restartPipeline).not.toHaveBeenCalled();
    });

    it('restarts a release pipeline with confirm', async () => {
      const restartPipeline = vi.fn(async () => pipeline({ number: 45 }));
      const { call } = setup({
        getPipeline: vi.fn(async () => pipeline({ variables: { RELEASE_TAG: 'v1.2.3' } })),
        restartPipeline,
      });
      await call('woodpecker_restart_pipeline', { repo: REPO, number: 42, confirm: true });
      expect(restartPipeline).toHaveBeenCalledWith(7, 42);
    });
  });

  describe('approve, decline, cancel', () => {
    it('refuses to approve or decline a pipeline that is not blocked', async () => {
      const { call, client } = setup({ getPipeline: vi.fn(async () => pipeline({ status: 'running' })) });
      await expect(call('woodpecker_approve_pipeline', { repo: REPO, number: 42 })).rejects.toThrow(
        'Pipeline 42 in jfms7s/budget-manager is running, not waiting for approval.',
      );
      await expect(call('woodpecker_decline_pipeline', { repo: REPO, number: 42 })).rejects.toThrow(/not waiting/);
      expect(client.approvePipeline).not.toHaveBeenCalled();
      expect(client.declinePipeline).not.toHaveBeenCalled();
    });

    it('approves and declines a blocked pipeline', async () => {
      const approvePipeline = vi.fn(async () => pipeline({ status: 'pending' }));
      const declinePipeline = vi.fn(async () => pipeline({ status: 'declined' }));
      const { call } = setup({
        getPipeline: vi.fn(async () => pipeline({ status: 'blocked' })),
        approvePipeline,
        declinePipeline,
      });
      await expect(call('woodpecker_approve_pipeline', { repo: REPO, number: 42 })).resolves.toMatchObject({
        approved: true,
        pipeline: { status: 'pending' },
      });
      await expect(call('woodpecker_decline_pipeline', { repo: REPO, number: 42 })).resolves.toMatchObject({
        declined: true,
        pipeline: { status: 'declined' },
      });
      expect(approvePipeline).toHaveBeenCalledWith(7, 42);
      expect(declinePipeline).toHaveBeenCalledWith(7, 42);
    });

    it('cancels and reports the status it had', async () => {
      const cancelPipeline = vi.fn(async () => undefined);
      const { call } = setup({ getPipeline: vi.fn(async () => pipeline({ status: 'running' })), cancelPipeline });
      await expect(call('woodpecker_cancel_pipeline', { repo: REPO, number: 42 })).resolves.toEqual({
        canceled: true,
        repo: REPO,
        number: 42,
        previousStatus: 'running',
      });
      expect(cancelPipeline).toHaveBeenCalledWith(7, 42);
    });
  });
});
