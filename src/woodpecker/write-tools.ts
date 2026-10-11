import { z } from 'zod';
import { hasStatus } from '../http/errors.js';
import { defineTool, type ToolDefinition } from '../mcp/types.js';
import type { WoodpeckerClient } from './client.js';
import { confirmInput, pipelineNumber, repoInput } from './inputs.js';
import { loadPipeline } from './pipelines.js';
import { RELEASE_TAG_PATTERN, defaultBranchOf, previewRelease, releaseMessage } from './release.js';
import type { RepoResolver } from './repos.js';
import { summarisePipeline } from './shape.js';
import { RELEASE_VARIABLE, type WpPipeline, type WpRepo } from './types.js';

const WRITE = { readOnlyHint: false, openWorldHint: false } as const;

/** Woodpecker answers 500, not 404, for a branch that doesn't exist (the poller's finding on 3.18.1). */
async function trigger(
  start: () => Promise<WpPipeline | undefined>,
  repo: WpRepo,
  branch: string,
): Promise<WpPipeline | undefined> {
  try {
    return await start();
  } catch (error) {
    if (hasStatus(error, 404)) {
      throw new Error(`Woodpecker answered 404: branch "${branch}" was not found in ${repo.full_name}.`);
    }
    if (hasStatus(error, 500)) {
      throw new Error(
        `Woodpecker answered 500 for branch "${branch}" in ${repo.full_name}; the branch may not exist (Woodpecker answers 500 for a missing branch).`,
      );
    }
    throw error;
  }
}

function notStarted(repo: WpRepo, what: string) {
  return {
    started: false,
    message: `No workflow in ${repo.full_name} runs on a manual event for ${what}; nothing was started.`,
  };
}

async function requireBlocked(client: WoodpeckerClient, repo: WpRepo, number: number): Promise<WpPipeline> {
  const found = await loadPipeline(client, repo, number);
  if (found.status !== 'blocked') {
    throw new Error(`Pipeline ${number} in ${repo.full_name} is ${found.status}, not waiting for approval.`);
  }
  return found;
}

export function createWriteTools(client: WoodpeckerClient, repos: RepoResolver): ToolDefinition[] {
  return [
    defineTool({
      name: 'woodpecker_start_pipeline',
      description:
        'Start a manual pipeline on the head of a branch: the same run the poller starts for a new commit. No variables are passed; use woodpecker_start_release for a release.',
      inputSchema: { repo: repoInput, branch: z.string().min(1).describe('Branch to build') },
      annotations: { ...WRITE, destructiveHint: false, idempotentHint: false },
      handler: async ({ repo, branch }) => {
        const target = await repos.resolve(repo);
        const started = await trigger(() => client.createPipeline(target.id, { branch }), target, branch);
        return started
          ? { started: true, pipeline: summarisePipeline(started) }
          : notStarted(target, `branch "${branch}"`);
      },
    }),
    defineTool({
      name: 'woodpecker_restart_pipeline',
      description:
        'Re-run a whole pipeline on the same commit with its original variables. A pipeline that carried RELEASE_TAG is a release: without confirm=true this only previews it.',
      inputSchema: { repo: repoInput, number: pipelineNumber, confirm: confirmInput },
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: false },
      handler: async ({ repo, number, confirm }) => {
        const target = await repos.resolve(repo);
        const original = await loadPipeline(client, target, number);
        const tag = original.variables?.[RELEASE_VARIABLE];
        if (tag !== undefined && !confirm) {
          return { restartOf: number, ...(await previewRelease(client, target, tag)) };
        }
        const restarted = await client.restartPipeline(target.id, number);
        return restarted
          ? { started: true, restartOf: number, pipeline: summarisePipeline(restarted) }
          : {
              started: false,
              restartOf: number,
              message: `Woodpecker started nothing for pipeline ${number} in ${target.full_name}: no workflow matched.`,
            };
      },
    }),
    defineTool({
      name: 'woodpecker_cancel_pipeline',
      description: 'Cancel a pending or running pipeline.',
      inputSchema: { repo: repoInput, number: pipelineNumber },
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
      handler: async ({ repo, number }) => {
        const target = await repos.resolve(repo);
        const current = await loadPipeline(client, target, number);
        await client.cancelPipeline(target.id, number);
        return { canceled: true, repo: target.full_name, number, previousStatus: current.status };
      },
    }),
    defineTool({
      name: 'woodpecker_approve_pipeline',
      description: 'Approve a pipeline that is blocked waiting for approval, so it runs.',
      inputSchema: { repo: repoInput, number: pipelineNumber },
      annotations: { ...WRITE, destructiveHint: false, idempotentHint: false },
      handler: async ({ repo, number }) => {
        const target = await repos.resolve(repo);
        const blocked = await requireBlocked(client, target, number);
        const approved = await client.approvePipeline(target.id, number);
        return { approved: true, pipeline: summarisePipeline(approved ?? blocked) };
      },
    }),
    defineTool({
      name: 'woodpecker_decline_pipeline',
      description: 'Decline a pipeline that is blocked waiting for approval, so it never runs.',
      inputSchema: { repo: repoInput, number: pipelineNumber },
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
      handler: async ({ repo, number }) => {
        const target = await repos.resolve(repo);
        const blocked = await requireBlocked(client, target, number);
        const declined = await client.declinePipeline(target.id, number);
        return { declined: true, pipeline: summarisePipeline(declined ?? blocked) };
      },
    }),
    defineTool({
      name: 'woodpecker_start_release',
      description:
        'Start the release pipeline for an existing vX.Y.Z tag: a manual run on the default branch with RELEASE_TAG set, exactly as the poller starts it. Without confirm=true it only previews, listing earlier runs of the same tag.',
      inputSchema: {
        repo: repoInput,
        tag: z.string().regex(RELEASE_TAG_PATTERN, 'tag must look like vX.Y.Z').describe('Release tag, e.g. v1.2.3'),
        confirm: confirmInput,
      },
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: false },
      handler: async ({ repo, tag, confirm }) => {
        const target = await repos.resolve(repo);
        if (!confirm) return previewRelease(client, target, tag);
        const branch = defaultBranchOf(target);
        const started = await trigger(
          () =>
            client.createPipeline(target.id, {
              branch,
              variables: { [RELEASE_VARIABLE]: tag },
              message: releaseMessage(tag),
            }),
          target,
          branch,
        );
        return started
          ? { started: true, pipeline: summarisePipeline(started) }
          : notStarted(target, `branch "${branch}" with ${RELEASE_VARIABLE}=${tag}`);
      },
    }),
  ];
}
