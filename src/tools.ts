import type { WoodpeckerMcpConfig } from './config.js';
import { createWoodpeckerHttpClient } from './http/client.js';
import type { ToolDefinition } from './mcp/types.js';
import { createWoodpeckerClient } from './woodpecker/client.js';
import { createReadTools } from './woodpecker/read-tools.js';
import { createRepoResolver } from './woodpecker/repos.js';
import { createWriteTools } from './woodpecker/write-tools.js';

export function buildTools(config: WoodpeckerMcpConfig): ToolDefinition[] {
  const client = createWoodpeckerClient(createWoodpeckerHttpClient(config.woodpecker));
  const repos = createRepoResolver(client);
  return [...createReadTools(client, repos), ...createWriteTools(client, repos)];
}
