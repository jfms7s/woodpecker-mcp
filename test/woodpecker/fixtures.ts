import { vi } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition } from '../../src/mcp/types.js';
import type { WoodpeckerClient } from '../../src/woodpecker/client.js';
import type { WpPipeline, WpRepo } from '../../src/woodpecker/types.js';

export const repo: WpRepo = {
  id: 7,
  full_name: 'jfms7s/budget-manager',
  default_branch: 'main',
  active: true,
  private: true,
};

export function pipeline(overrides: Partial<WpPipeline> = {}): WpPipeline {
  return {
    id: 100,
    number: 42,
    author: 'jfms7s',
    event: 'manual',
    status: 'success',
    created: 1760000000,
    started: 1760000010,
    finished: 1760000070,
    commit: 'abcdef1234567890',
    branch: 'main',
    ref: 'refs/heads/main',
    message: 'fix: thing\n\nlonger body',
    ...overrides,
  };
}

/** Every method not overridden fails the test if called. */
export function fakeClient(overrides: Partial<WoodpeckerClient> = {}): WoodpeckerClient {
  const unexpected = (name: string) =>
    vi.fn(async () => {
      throw new Error(`unexpected call: ${name}`);
    });
  return {
    listRepos: unexpected('listRepos'),
    lookupRepo: vi.fn(async () => repo),
    getRepo: vi.fn(async () => repo),
    listPipelines: unexpected('listPipelines'),
    getPipeline: unexpected('getPipeline'),
    getPipelineConfig: unexpected('getPipelineConfig'),
    getStepLogs: unexpected('getStepLogs'),
    createPipeline: unexpected('createPipeline'),
    restartPipeline: unexpected('restartPipeline'),
    cancelPipeline: unexpected('cancelPipeline'),
    approvePipeline: unexpected('approvePipeline'),
    declinePipeline: unexpected('declinePipeline'),
    ...overrides,
  };
}

/** Calls a tool the way the MCP server does: arguments parsed (defaults applied, unknown keys stripped) first. */
export function caller(tools: ToolDefinition[]) {
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool named ${name}`);
    return tool.handler(z.object(tool.inputSchema).parse(args));
  };
}
