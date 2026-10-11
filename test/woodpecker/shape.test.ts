import { describe, expect, it } from 'vitest';
import { describePipeline, summarisePipeline, summariseRepo } from '../../src/woodpecker/shape.js';
import type { WpStep } from '../../src/woodpecker/types.js';
import { pipeline, repo } from './fixtures.js';

const step = (id: number, name: string, state: WpStep['state'], exit_code = 0): WpStep => ({
  id,
  pid: id,
  ppid: 1,
  name,
  state,
  exit_code,
  started: 1760000010,
  finished: 1760000020,
});

describe('summarisePipeline', () => {
  it('shortens the commit, keeps the first message line, and converts times', () => {
    expect(summarisePipeline(pipeline())).toEqual({
      number: 42,
      status: 'success',
      event: 'manual',
      branch: 'main',
      commit: 'abcdef12',
      title: 'fix: thing',
      author: 'jfms7s',
      created: '2025-10-09T08:53:20.000Z',
      started: '2025-10-09T08:53:30.000Z',
      durationSeconds: 60,
    });
  });

  it('shows RELEASE_TAG when the pipeline carries it', () => {
    expect(summarisePipeline(pipeline({ variables: { RELEASE_TAG: 'v1.2.3' } })).releaseTag).toBe('v1.2.3');
  });

  it('gives a running or not-yet-started pipeline no duration and no start time', () => {
    expect(summarisePipeline(pipeline({ status: 'running', finished: 0 })).durationSeconds).toBeUndefined();
    const pending = summarisePipeline(pipeline({ status: 'pending', started: 0, finished: 0 }));
    expect(pending.started).toBeUndefined();
    expect(pending.durationSeconds).toBeUndefined();
  });
});

describe('describePipeline', () => {
  it('puts failed workflows first, and failed steps first inside each', () => {
    const detail = describePipeline(
      pipeline({
        status: 'failure',
        workflows: [
          { id: 1, pid: 1, name: 'lint', state: 'success', children: [step(11, 'eslint', 'success')] },
          {
            id: 2,
            pid: 2,
            name: 'test',
            state: 'failure',
            children: [step(21, 'clone', 'success'), step(22, 'vitest', 'failure', 1)],
          },
        ],
      }),
    );
    expect(detail.workflows.map((w) => w.name)).toEqual(['test', 'lint']);
    expect(detail.workflows[0]?.steps.map((s) => s.name)).toEqual(['vitest', 'clone']);
    expect(detail.workflows[0]?.steps[0]).toEqual({
      id: 22,
      name: 'vitest',
      state: 'failure',
      exitCode: 1,
      durationSeconds: 10,
    });
  });

  it('keeps the full message and ref, and marks warnings', () => {
    const detail = describePipeline(
      pipeline({ errors: [{ message: 'bad yaml' }, { message: 'deprecated key', is_warning: true }] }),
    );
    expect(detail.message).toBe('fix: thing\n\nlonger body');
    expect(detail.ref).toBe('refs/heads/main');
    expect(detail.errors).toEqual(['bad yaml', 'warning: deprecated key']);
    expect(detail.workflows).toEqual([]);
  });
});

describe('summariseRepo', () => {
  it('names the default branch and the last pipeline', () => {
    expect(summariseRepo({ ...repo, last_pipeline: pipeline({ status: 'failure' }) })).toEqual({
      id: 7,
      fullName: 'jfms7s/budget-manager',
      active: true,
      private: true,
      defaultBranch: 'main',
      lastPipeline: { number: 42, status: 'failure', branch: 'main' },
    });
  });
});
