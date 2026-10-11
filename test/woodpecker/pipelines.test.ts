import { describe, expect, it, vi } from 'vitest';
import { WoodpeckerApiError } from '../../src/http/errors.js';
import { findStep, loadPipeline } from '../../src/woodpecker/pipelines.js';
import type { WpPipeline } from '../../src/woodpecker/types.js';
import { fakeClient, pipeline, repo } from './fixtures.js';

const withSteps: WpPipeline = pipeline({
  workflows: [
    {
      id: 1,
      pid: 1,
      name: 'checks',
      state: 'failure',
      children: [
        { id: 11, pid: 2, ppid: 1, name: 'clone', state: 'success', exit_code: 0 },
        { id: 12, pid: 3, ppid: 1, name: 'test', state: 'failure', exit_code: 1 },
      ],
    },
    {
      id: 2,
      pid: 4,
      name: 'release-amd64',
      state: 'success',
      children: [{ id: 21, pid: 5, ppid: 4, name: 'clone', state: 'success', exit_code: 0 }],
    },
  ],
});

describe('findStep', () => {
  it('finds a step by id, by unique name, and by workflow/step', () => {
    expect(findStep(withSteps, '12').name).toBe('test');
    expect(findStep(withSteps, 'test').id).toBe(12);
    expect(findStep(withSteps, 'release-amd64/clone').id).toBe(21);
  });

  it('refuses an ambiguous name and lists the qualified names', () => {
    expect(() => findStep(withSteps, 'clone')).toThrow(
      'Step name "clone" is in more than one workflow; use workflow/step. Steps: checks/clone, checks/test, release-amd64/clone',
    );
  });

  it('lists the steps when nothing matches', () => {
    expect(() => findStep(withSteps, 'deploy')).toThrow(
      'No step "deploy" in pipeline 42. Steps: checks/clone, checks/test, release-amd64/clone',
    );
    expect(() => findStep(pipeline(), 'x')).toThrow('No step "x" in pipeline 42. Steps: (none)');
  });
});

describe('loadPipeline', () => {
  const notFound = () =>
    vi.fn(async () => {
      throw new WoodpeckerApiError({ method: 'GET', path: '/api/x', status: 404, detail: 'x' });
    });

  it('returns the pipeline', async () => {
    const client = fakeClient({ getPipeline: vi.fn(async () => withSteps) });
    await expect(loadPipeline(client, repo, 42)).resolves.toBe(withSteps);
    expect(client.getPipeline).toHaveBeenCalledWith(7, 42);
  });

  it('names a missing pipeline', async () => {
    await expect(loadPipeline(fakeClient({ getPipeline: notFound() }), repo, 9)).rejects.toThrow(
      'Pipeline 9 not found in jfms7s/budget-manager',
    );
  });

  it('explains a missing latest pipeline', async () => {
    await expect(loadPipeline(fakeClient({ getPipeline: notFound() }), repo, 'latest')).rejects.toThrow(
      'jfms7s/budget-manager has no pipeline on its default branch yet',
    );
  });

  it('rethrows other errors untouched', async () => {
    const boom = new WoodpeckerApiError({ method: 'GET', path: '/api/x', status: 500, detail: 'x' });
    const client = fakeClient({
      getPipeline: vi.fn(async () => {
        throw boom;
      }),
    });
    await expect(loadPipeline(client, repo, 1)).rejects.toBe(boom);
  });
});
