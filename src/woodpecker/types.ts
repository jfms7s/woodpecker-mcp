/** Woodpecker v3.19.0 API shapes: only the fields this server reads (server/model/*.go). */

export const PIPELINE_EVENTS = [
  'push',
  'pull_request',
  'pull_request_closed',
  'pull_request_metadata',
  'tag',
  'release',
  'deployment',
  'cron',
  'manual',
] as const;

export const PIPELINE_STATUSES = [
  'skipped',
  'pending',
  'running',
  'success',
  'failure',
  'killed',
  'canceled',
  'error',
  'blocked',
  'declined',
  'created',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** The manual-pipeline variable the poller and the release pipelines use. */
export const RELEASE_VARIABLE = 'RELEASE_TAG';

export interface WpStep {
  id: number;
  pid: number;
  ppid: number;
  name: string;
  state: PipelineStatus;
  error?: string;
  exit_code: number;
  started?: number;
  finished?: number;
  type?: string;
}

export interface WpWorkflow {
  id: number;
  pid: number;
  name: string;
  state: PipelineStatus;
  error?: string;
  started?: number;
  finished?: number;
  children?: WpStep[];
}

export interface WpPipelineError {
  message: string;
  is_warning?: boolean;
}

export interface WpPipeline {
  id: number;
  number: number;
  author: string;
  event: string;
  status: PipelineStatus;
  errors?: WpPipelineError[] | null;
  created: number;
  started: number;
  finished: number;
  commit: string;
  branch: string;
  ref: string;
  message: string;
  forge_url?: string;
  variables?: Record<string, string>;
  workflows?: WpWorkflow[];
}

export interface WpRepo {
  id: number;
  full_name: string;
  default_branch?: string;
  active: boolean;
  private: boolean;
  forge_url?: string;
  last_pipeline?: WpPipeline;
}

/** `data` is base64 (Go []byte), or null for an empty entry. `type`: 0 stdout, 1 stderr, 2 exit code, 3 metadata, 4 progress. */
export interface WpLogEntry {
  id: number;
  step_id: number;
  time: number;
  line: number;
  data: string | null;
  type: number;
}

/** `data` is base64 YAML. */
export interface WpConfigFile {
  hash: string;
  name: string;
  data: string;
}

export interface PipelineFilter {
  branch?: string;
  event?: string;
  status?: string;
  page: number;
  perPage: number;
}

export interface CreatePipelineOptions {
  branch: string;
  variables?: Record<string, string>;
  message?: string;
}
