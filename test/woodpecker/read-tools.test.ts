import { describe, expect, it, vi } from 'vitest';
import { WoodpeckerApiError } from '../../src/http/errors.js';
import { createReadTools } from '../../src/woodpecker/read-tools.js';
import { createRepoResolver } from '../../src/woodpecker/repos.js';
import type { WoodpeckerClient } from '../../src/woodpecker/client.js';
import { caller, fakeClient, pipeline, repo } from './fixtures.js';

function setup(overrides: Partial<WoodpeckerClient>) {
  const client = fakeClient(overrides);
  return { client, call: caller(createReadTools(client, createRepoResolver(client))) };
}

const b64 = (text: string) => Buffer.from(text).toString('base64');

const withTestStep = pipeline({
  status: 'failure',
  workflows: [
    {
      id: 1,
      pid: 1,
      name: 'checks',
      state: 'failure',
      children: [{ id: 12, pid: 2, ppid: 1, name: 'test', state: 'failure', exit_code: 1 }],
    },
  ],
});

describe('read tools', () => {
  it('registers five read-only woodpecker_ tools', () => {
    const tools = createReadTools(fakeClient(), createRepoResolver(fakeClient()));
    expect(tools.map((t) => t.name)).toEqual([
      'woodpecker_list_repos',
      'woodpecker_list_pipelines',
      'woodpecker_get_pipeline',
      'woodpecker_get_step_logs',
      'woodpecker_get_pipeline_config',
    ]);
    expect(tools.every((t) => t.annotations.readOnlyHint === true)).toBe(true);
  });

  it('woodpecker_list_repos summarises each repo', async () => {
    const { call } = setup({ listRepos: vi.fn(async () => [repo]) });
    await expect(call('woodpecker_list_repos', {})).resolves.toEqual([
      { id: 7, fullName: 'jfms7s/budget-manager', active: true, private: true, defaultBranch: 'main' },
    ]);
  });

  it('woodpecker_list_pipelines applies the default page and limit', async () => {
    const listPipelines = vi.fn(async () => [pipeline()]);
    const { call } = setup({ listPipelines });
    const result = (await call('woodpecker_list_pipelines', { repo: 'jfms7s/budget-manager' })) as {
      repo: string;
      page: number;
      pipelines: Array<{ number: number }>;
    };
    expect(listPipelines).toHaveBeenCalledWith(7, {
      branch: undefined,
      event: undefined,
      status: undefined,
      page: 1,
      perPage: 20,
    });
    expect(result.repo).toBe('jfms7s/budget-manager');
    expect(result.page).toBe(1);
    expect(result.pipelines.map((p) => p.number)).toEqual([42]);
  });

  it('woodpecker_list_pipelines rejects a limit above 50 and an unknown status', async () => {
    const { call } = setup({});
    await expect(call('woodpecker_list_pipelines', { repo: 'a/b', limit: 51 })).rejects.toThrow();
    await expect(call('woodpecker_list_pipelines', { repo: 'a/b', status: 'broken' })).rejects.toThrow();
  });

  it('woodpecker_get_pipeline accepts "latest"', async () => {
    const getPipeline = vi.fn(async () => withTestStep);
    const { call } = setup({ getPipeline });
    const detail = (await call('woodpecker_get_pipeline', { repo: '7', number: 'latest' })) as {
      workflows: Array<{ name: string }>;
    };
    expect(getPipeline).toHaveBeenCalledWith(7, 'latest');
    expect(detail.workflows[0]?.name).toBe('checks');
  });

  it('woodpecker_get_pipeline names a missing pipeline', async () => {
    const { call } = setup({
      getPipeline: vi.fn(async () => {
        throw new WoodpeckerApiError({ method: 'GET', path: '/api/x', status: 404, detail: 'x' });
      }),
    });
    await expect(call('woodpecker_get_pipeline', { repo: 'jfms7s/budget-manager', number: 9 })).rejects.toThrow(
      'Pipeline 9 not found in jfms7s/budget-manager',
    );
  });

  it('woodpecker_get_step_logs finds the step by name and filters its log', async () => {
    const getStepLogs = vi.fn(async () => [
      { id: 1, step_id: 12, time: 0, line: 0, data: b64('ok'), type: 0 },
      { id: 2, step_id: 12, time: 0, line: 1, data: b64('FAIL src/a.test.ts'), type: 1 },
    ]);
    const { call } = setup({ getPipeline: vi.fn(async () => withTestStep), getStepLogs });
    const result = (await call('woodpecker_get_step_logs', {
      repo: 'jfms7s/budget-manager',
      pipeline: 42,
      step: 'test',
      grep: 'fail',
    })) as { step: unknown; lines: string[]; totalLines: number };
    expect(getStepLogs).toHaveBeenCalledWith(7, 42, 12);
    expect(result.step).toEqual({ id: 12, name: 'test', state: 'failure', exitCode: 1 });
    expect(result.totalLines).toBe(2);
    expect(result.lines).toEqual(['2: FAIL src/a.test.ts']);
  });

  it('woodpecker_get_step_logs lists the steps when the name is wrong', async () => {
    const { call } = setup({ getPipeline: vi.fn(async () => withTestStep) });
    await expect(
      call('woodpecker_get_step_logs', { repo: 'jfms7s/budget-manager', pipeline: 42, step: 'lint' }),
    ).rejects.toThrow('Steps: checks/test');
  });

  it('woodpecker_get_pipeline_config decodes each file', async () => {
    const { call } = setup({
      getPipelineConfig: vi.fn(async () => [{ hash: 'h', name: 'checks', data: b64('steps: []\n') }]),
    });
    await expect(
      call('woodpecker_get_pipeline_config', { repo: 'jfms7s/budget-manager', pipeline: 42 }),
    ).resolves.toEqual([{ name: 'checks', yaml: 'steps: []\n' }]);
  });

  it('rejects a repo that is neither owner/name nor an id', async () => {
    const { call, client } = setup({});
    await expect(call('woodpecker_list_pipelines', { repo: 'budget-manager' })).rejects.toThrow(/owner\/name/);
    expect(client.lookupRepo).not.toHaveBeenCalled();
  });
});
