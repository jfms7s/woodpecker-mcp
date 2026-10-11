import {
  RELEASE_VARIABLE,
  type PipelineStatus,
  type WpPipeline,
  type WpRepo,
  type WpStep,
  type WpWorkflow,
} from './types.js';

const FAILED: ReadonlySet<string> = new Set(['failure', 'error', 'killed', 'declined']);

export interface RepoSummary {
  id: number;
  fullName: string;
  active: boolean;
  private: boolean;
  defaultBranch?: string;
  lastPipeline?: { number: number; status: PipelineStatus; branch: string };
}

export interface PipelineSummary {
  number: number;
  status: PipelineStatus;
  event: string;
  branch: string;
  commit: string;
  title: string;
  author: string;
  created?: string;
  started?: string;
  durationSeconds?: number;
  releaseTag?: string;
}

export interface StepSummary {
  id: number;
  name: string;
  state: PipelineStatus;
  exitCode: number;
  durationSeconds?: number;
  error?: string;
}

export interface WorkflowSummary {
  name: string;
  state: PipelineStatus;
  error?: string;
  steps: StepSummary[];
}

export interface PipelineDetail extends PipelineSummary {
  message: string;
  ref: string;
  forgeUrl?: string;
  errors: string[];
  workflows: WorkflowSummary[];
}

export function isoTime(unixSeconds: number | undefined): string | undefined {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : undefined;
}

export function durationSeconds(started?: number, finished?: number): number | undefined {
  if (!started || !finished || finished < started) return undefined;
  return finished - started;
}

/** Stable: failed items first, each group in its original order. */
function failedFirst<T extends { state: string }>(items: T[]): T[] {
  return [...items.filter((i) => FAILED.has(i.state)), ...items.filter((i) => !FAILED.has(i.state))];
}

export function summariseRepo(repo: WpRepo): RepoSummary {
  const last = repo.last_pipeline;
  return {
    id: repo.id,
    fullName: repo.full_name,
    active: repo.active,
    private: repo.private,
    ...(repo.default_branch ? { defaultBranch: repo.default_branch } : {}),
    ...(last ? { lastPipeline: { number: last.number, status: last.status, branch: last.branch } } : {}),
  };
}

export function summarisePipeline(p: WpPipeline): PipelineSummary {
  const releaseTag = p.variables?.[RELEASE_VARIABLE];
  const created = isoTime(p.created);
  const started = isoTime(p.started);
  const duration = durationSeconds(p.started, p.finished);
  return {
    number: p.number,
    status: p.status,
    event: p.event,
    branch: p.branch,
    commit: p.commit.slice(0, 8),
    title: p.message.split('\n')[0] ?? '',
    author: p.author,
    ...(created ? { created } : {}),
    ...(started ? { started } : {}),
    ...(duration !== undefined ? { durationSeconds: duration } : {}),
    ...(releaseTag ? { releaseTag } : {}),
  };
}

function summariseStep(s: WpStep): StepSummary {
  const duration = durationSeconds(s.started, s.finished);
  return {
    id: s.id,
    name: s.name,
    state: s.state,
    exitCode: s.exit_code,
    ...(duration !== undefined ? { durationSeconds: duration } : {}),
    ...(s.error ? { error: s.error } : {}),
  };
}

function summariseWorkflow(w: WpWorkflow): WorkflowSummary {
  return {
    name: w.name,
    state: w.state,
    ...(w.error ? { error: w.error } : {}),
    steps: failedFirst((w.children ?? []).map(summariseStep)),
  };
}

export function describePipeline(p: WpPipeline): PipelineDetail {
  return {
    ...summarisePipeline(p),
    message: p.message,
    ref: p.ref,
    ...(p.forge_url ? { forgeUrl: p.forge_url } : {}),
    errors: (p.errors ?? []).map((e) => (e.is_warning ? `warning: ${e.message}` : e.message)),
    workflows: failedFirst((p.workflows ?? []).map(summariseWorkflow)),
  };
}
