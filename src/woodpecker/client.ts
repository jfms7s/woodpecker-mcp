import type { WoodpeckerHttpClient } from '../http/client.js';
import type {
  CreatePipelineOptions,
  PipelineFilter,
  WpConfigFile,
  WpLogEntry,
  WpPipeline,
  WpRepo,
} from './types.js';

export interface WoodpeckerClient {
  listRepos(): Promise<WpRepo[]>;
  lookupRepo(fullName: string): Promise<WpRepo>;
  getRepo(repoId: number): Promise<WpRepo>;
  listPipelines(repoId: number, filter: PipelineFilter): Promise<WpPipeline[]>;
  getPipeline(repoId: number, number: number | 'latest'): Promise<WpPipeline>;
  getPipelineConfig(repoId: number, number: number): Promise<WpConfigFile[]>;
  getStepLogs(repoId: number, number: number, stepId: number): Promise<WpLogEntry[]>;
  /** undefined when Woodpecker answers 204: no workflow matched, nothing was recorded. */
  createPipeline(repoId: number, options: CreatePipelineOptions): Promise<WpPipeline | undefined>;
  restartPipeline(repoId: number, number: number): Promise<WpPipeline | undefined>;
  cancelPipeline(repoId: number, number: number): Promise<void>;
  approvePipeline(repoId: number, number: number): Promise<WpPipeline | undefined>;
  declinePipeline(repoId: number, number: number): Promise<WpPipeline | undefined>;
}

function fullNamePath(fullName: string): string {
  return fullName.split('/').map(encodeURIComponent).join('/');
}

export function createWoodpeckerClient(http: WoodpeckerHttpClient): WoodpeckerClient {
  // Woodpecker is Go: an empty slice can serialise as null. Every list goes
  // through this so callers only ever see arrays.
  const list = async <T>(path: string, query?: Parameters<WoodpeckerHttpClient['get']>[1]) =>
    (await http.get<T[] | null>(path, query)) ?? [];

  return {
    listRepos: () => list<WpRepo>('/user/repos'),
    lookupRepo: (fullName) => http.get<WpRepo>(`/repos/lookup/${fullNamePath(fullName)}`),
    getRepo: (repoId) => http.get<WpRepo>(`/repos/${repoId}`),
    listPipelines: (repoId, filter) =>
      list<WpPipeline>(`/repos/${repoId}/pipelines`, {
        branch: filter.branch,
        event: filter.event,
        status: filter.status,
        page: filter.page,
        perPage: filter.perPage,
      }),
    getPipeline: (repoId, number) => http.get<WpPipeline>(`/repos/${repoId}/pipelines/${number}`),
    getPipelineConfig: (repoId, number) => list<WpConfigFile>(`/repos/${repoId}/pipelines/${number}/config`),
    getStepLogs: (repoId, number, stepId) => list<WpLogEntry>(`/repos/${repoId}/logs/${number}/${stepId}`),
    createPipeline: (repoId, options) => {
      const body: Record<string, unknown> = { branch: options.branch };
      if (options.variables) body.variables = options.variables;
      if (options.message) body.message = options.message;
      return http.post<WpPipeline>(`/repos/${repoId}/pipelines`, body);
    },
    restartPipeline: (repoId, number) => http.post<WpPipeline>(`/repos/${repoId}/pipelines/${number}`),
    cancelPipeline: async (repoId, number) => {
      await http.post(`/repos/${repoId}/pipelines/${number}/cancel`);
    },
    approvePipeline: (repoId, number) => http.post<WpPipeline>(`/repos/${repoId}/pipelines/${number}/approve`),
    declinePipeline: (repoId, number) => http.post<WpPipeline>(`/repos/${repoId}/pipelines/${number}/decline`),
  };
}
