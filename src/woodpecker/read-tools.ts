import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../mcp/types.js';
import type { WoodpeckerClient } from './client.js';
import { pipelineNumber, repoInput } from './inputs.js';
import { DEFAULT_TAIL, MAX_LINES, decodeLogEntries, selectLogLines } from './logs.js';
import { findStep, loadPipeline } from './pipelines.js';
import type { RepoResolver } from './repos.js';
import { describePipeline, summarisePipeline, summariseRepo } from './shape.js';
import { PIPELINE_EVENTS, PIPELINE_STATUSES } from './types.js';

const READ = { readOnlyHint: true, openWorldHint: false } as const;

export function createReadTools(client: WoodpeckerClient, repos: RepoResolver): ToolDefinition[] {
  return [
    defineTool({
      name: 'woodpecker_list_repos',
      description:
        "List the Woodpecker repositories this server can see, with each one's id, default branch and last pipeline.",
      inputSchema: {},
      annotations: READ,
      handler: async () => (await client.listRepos()).map(summariseRepo),
    }),
    defineTool({
      name: 'woodpecker_list_pipelines',
      description:
        "List a repository's pipelines, newest first: number, status, event, branch, commit, title, duration and RELEASE_TAG when set. Filter by branch, event or status; page with page.",
      inputSchema: {
        repo: repoInput,
        branch: z.string().min(1).optional().describe('Only pipelines on this branch'),
        event: z.enum(PIPELINE_EVENTS).optional().describe('Only pipelines started by this event'),
        status: z.enum(PIPELINE_STATUSES).optional().describe('Only pipelines with this status'),
        limit: z.number().int().min(1).max(50).default(20).describe('Pipelines per page, at most 50'),
        page: z.number().int().min(1).default(1).describe('Page number, starting at 1'),
      },
      annotations: READ,
      handler: async ({ repo, branch, event, status, limit, page }) => {
        const target = await repos.resolve(repo);
        const pipelines = await client.listPipelines(target.id, { branch, event, status, page, perPage: limit });
        return { repo: target.full_name, page, pipelines: pipelines.map(summarisePipeline) };
      },
    }),
    defineTool({
      name: 'woodpecker_get_pipeline',
      description:
        'Show one pipeline: summary, full commit message, errors, and every workflow with its steps (id, state, exit code, duration). Failed workflows and steps come first. Use "latest" for the newest pipeline on the default branch.',
      inputSchema: {
        repo: repoInput,
        number: z.union([pipelineNumber, z.literal('latest')]).describe('Pipeline number, or "latest"'),
      },
      annotations: READ,
      handler: async ({ repo, number }) => describePipeline(await loadPipeline(client, await repos.resolve(repo), number)),
    }),
    defineTool({
      name: 'woodpecker_get_step_logs',
      description:
        "Read a step's log. Returns numbered lines: by default the last 200. Filter with grep (case-insensitive) and narrow with from_line/to_line; applied in that order (range, grep, tail). Output is capped at 1000 lines and 50,000 characters.",
      inputSchema: {
        repo: repoInput,
        pipeline: pipelineNumber,
        step: z
          .string()
          .min(1)
          .describe('Step id, step name, or "workflow/step" when the same name appears in more than one workflow'),
        tail: z.number().int().min(1).max(MAX_LINES).default(DEFAULT_TAIL).describe('How many of the last matching lines to return'),
        grep: z.string().min(1).optional().describe('Only lines containing this text (case-insensitive)'),
        from_line: z.number().int().min(1).optional().describe('First line number to consider'),
        to_line: z.number().int().min(1).optional().describe('Last line number to consider'),
      },
      annotations: READ,
      handler: async ({ repo, pipeline, step, tail, grep, from_line, to_line }) => {
        const target = await repos.resolve(repo);
        const found = findStep(await loadPipeline(client, target, pipeline), step);
        const entries = await client.getStepLogs(target.id, pipeline, found.id);
        return {
          repo: target.full_name,
          pipeline,
          step: { id: found.id, name: found.name, state: found.state, exitCode: found.exit_code },
          ...selectLogLines(decodeLogEntries(entries), { tail, grep, fromLine: from_line, toLine: to_line }),
        };
      },
    }),
    defineTool({
      name: 'woodpecker_get_pipeline_config',
      description: 'Show the pipeline config files (YAML) a pipeline actually ran with.',
      inputSchema: { repo: repoInput, pipeline: pipelineNumber },
      annotations: READ,
      handler: async ({ repo, pipeline }) => {
        const target = await repos.resolve(repo);
        const files = await client.getPipelineConfig(target.id, pipeline);
        return files.map((f) => ({ name: f.name, yaml: Buffer.from(f.data, 'base64').toString('utf8') }));
      },
    }),
  ];
}
