import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { pipelineNumber } from '../../src/woodpecker/inputs.js';
import { createReadTools } from '../../src/woodpecker/read-tools.js';
import { createWriteTools } from '../../src/woodpecker/write-tools.js';
import { createRepoResolver } from '../../src/woodpecker/repos.js';
import { fakeClient } from './fixtures.js';

describe('pipelineNumber', () => {
  it('accepts a number', () => {
    expect(pipelineNumber.parse(21)).toBe(21);
  });

  it('accepts a numeric string and converts it to a number', () => {
    expect(pipelineNumber.parse('21')).toBe(21);
  });

  it.each(['abc', '', '0', '-3', '1.5', ' 21', '1e2', 0, -1, 1.5, null, undefined])('rejects %j', (value) => {
    expect(pipelineNumber.safeParse(value).success).toBe(false);
  });
});

describe('number field on every pipeline tool', () => {
  const client = fakeClient();
  const resolver = createRepoResolver(client);
  const tools = [...createReadTools(client, resolver), ...createWriteTools(client, resolver)];
  const byName = (n: string) => tools.find((t) => t.name === n)!;

  it.each(['woodpecker_get_step_logs', 'woodpecker_get_pipeline_config'])('%s takes number, not pipeline', (name) => {
    const keys = Object.keys(byName(name).inputSchema);
    expect(keys).toContain('number');
    expect(keys).not.toContain('pipeline');
  });

  it('no tool has a pipeline input', () => {
    for (const t of tools) expect(Object.keys(t.inputSchema)).not.toContain('pipeline');
  });

  it('get_pipeline accepts latest, a number and a numeric string', () => {
    const schema = z.object(byName('woodpecker_get_pipeline').inputSchema);
    expect(schema.parse({ repo: 'a/b', number: 'latest' }).number).toBe('latest');
    expect(schema.parse({ repo: 'a/b', number: 7 }).number).toBe(7);
    expect(schema.parse({ repo: 'a/b', number: '7' }).number).toBe(7);
    expect(schema.safeParse({ repo: 'a/b', number: 'newest' }).success).toBe(false);
  });
});
