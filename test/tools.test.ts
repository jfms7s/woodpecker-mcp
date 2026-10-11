import { describe, expect, it } from 'vitest';
import { buildTools } from '../src/tools.js';

describe('buildTools', () => {
  const tools = buildTools({
    woodpecker: { baseUrl: 'http://wp.test', token: 't' },
    transport: 'stdio',
    port: 3000,
  });

  it('exposes 11 uniquely named woodpecker_ tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(11);
    expect(new Set(names).size).toBe(11);
    expect(names.every((n) => n.startsWith('woodpecker_'))).toBe(true);
  });

  it('gives every tool an explicit readOnlyHint', () => {
    expect(tools.every((t) => typeof t.annotations.readOnlyHint === 'boolean')).toBe(true);
  });
});
