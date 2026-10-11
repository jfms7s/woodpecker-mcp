// The release guard through the path production uses: the MCP SDK parses the
// raw zod shape (src/mcp/server.ts registerTool), not test/woodpecker/fixtures'
// caller(). Pins that an SDK upgrade can't start forwarding unknown keys or
// coercing confirm, either of which would let a release start unconfirmed.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../../src/mcp/server.js';
import { createRepoResolver } from '../../src/woodpecker/repos.js';
import { createWriteTools } from '../../src/woodpecker/write-tools.js';
import { fakeClient, pipeline } from '../woodpecker/fixtures.js';

async function connect(tools: Parameters<typeof createServer>[0]) {
  const server = createServer(tools);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' });
  await Promise.all([client.connect(ct), server.connect(st)]);
  return client;
}

describe('release guard through the MCP SDK', () => {
  it('start_pipeline: unknown keys never reach createPipeline', async () => {
    const createPipeline = vi.fn(async () => pipeline({ number: 43 }));
    const wp = fakeClient({ createPipeline });
    const client = await connect(createWriteTools(wp, createRepoResolver(wp)));
    const result = await client.callTool({
      name: 'woodpecker_start_pipeline',
      arguments: {
        repo: 'jfms7s/budget-manager',
        branch: 'main',
        variables: { RELEASE_TAG: 'v9.9.9' },
        RELEASE_TAG: 'v9.9.9',
        event: 'tag',
        message: 'release v9.9.9',
      },
    });
    expect(result.isError).toBeFalsy();
    expect(createPipeline).toHaveBeenCalledWith(7, { branch: 'main' });
  });

  it('restart_pipeline: release needs confirm, confirm as string is rejected', async () => {
    const restartPipeline = vi.fn(async () => pipeline({ number: 44 }));
    const wp = fakeClient({
      getPipeline: vi.fn(async () => pipeline({ variables: { RELEASE_TAG: 'v1.2.3' } })),
      listPipelines: vi.fn(async () => []),
      restartPipeline,
    });
    const client = await connect(createWriteTools(wp, createRepoResolver(wp)));
    const r1 = await client.callTool({
      name: 'woodpecker_restart_pipeline',
      arguments: { repo: 'jfms7s/budget-manager', number: 42, variables: { x: 'y' }, RELEASE_TAG: 'v1' },
    });
    expect(r1.isError).toBeFalsy();
    expect(restartPipeline).not.toHaveBeenCalled();
    const r2 = await client.callTool({
      name: 'woodpecker_restart_pipeline',
      arguments: { repo: 'jfms7s/budget-manager', number: 42, confirm: 'true' },
    });
    expect(r2.isError).toBe(true);
    expect(restartPipeline).not.toHaveBeenCalled();
    const r3 = await client.callTool({
      name: 'woodpecker_restart_pipeline',
      arguments: { repo: 'jfms7s/budget-manager', number: 42, confirm: 1 },
    });
    expect(r3.isError).toBe(true);
    expect(restartPipeline).not.toHaveBeenCalled();
  });

  it('start_release: confirm must be boolean true', async () => {
    const createPipeline = vi.fn(async () => pipeline({ number: 50 }));
    const wp = fakeClient({ createPipeline, listPipelines: vi.fn(async () => []) });
    const client = await connect(createWriteTools(wp, createRepoResolver(wp)));
    for (const confirm of ['true', 1, 'yes', {}, [true]]) {
      const r = await client.callTool({
        name: 'woodpecker_start_release',
        arguments: { repo: 'jfms7s/budget-manager', tag: 'v1.2.3', confirm },
      });
      expect(r.isError, JSON.stringify(confirm)).toBe(true);
    }
    expect(createPipeline).not.toHaveBeenCalled();
  });
});
