import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const base = {
  WOODPECKER_URL: 'http://woodpecker-server.woodpecker.svc.cluster.local',
  WOODPECKER_TOKEN: 'bot-token',
};

describe('loadConfig', () => {
  it('reads the Woodpecker connection and defaults to stdio on port 3000', () => {
    expect(loadConfig({ ...base })).toEqual({
      woodpecker: { baseUrl: 'http://woodpecker-server.woodpecker.svc.cluster.local', token: 'bot-token' },
      transport: 'stdio',
      port: 3000,
      token: undefined,
    });
  });

  it('strips trailing slashes from the url', () => {
    expect(loadConfig({ ...base, WOODPECKER_URL: 'http://wp.test//' }).woodpecker.baseUrl).toBe('http://wp.test');
  });

  it('requires WOODPECKER_URL', () => {
    expect(() => loadConfig({ WOODPECKER_TOKEN: 't' })).toThrow(new ConfigError('WOODPECKER_URL is required'));
  });

  it('requires WOODPECKER_TOKEN', () => {
    expect(() => loadConfig({ WOODPECKER_URL: 'http://wp.test' })).toThrow(
      new ConfigError('WOODPECKER_TOKEN is required'),
    );
  });

  it('rejects a url that does not parse', () => {
    expect(() => loadConfig({ ...base, WOODPECKER_URL: 'not a url' })).toThrow(/not a valid URL/);
  });

  it('rejects an unknown transport', () => {
    expect(() => loadConfig({ ...base, WOODPECKER_MCP_TRANSPORT: 'grpc' })).toThrow(/must be one of stdio, http, both/);
  });

  it('requires WOODPECKER_MCP_TOKEN for the http and both transports', () => {
    expect(() => loadConfig({ ...base, WOODPECKER_MCP_TRANSPORT: 'http' })).toThrow(/WOODPECKER_MCP_TOKEN is required/);
    expect(() => loadConfig({ ...base, WOODPECKER_MCP_TRANSPORT: 'both' })).toThrow(/WOODPECKER_MCP_TOKEN is required/);
  });

  it('accepts http with a token and a custom port', () => {
    const config = loadConfig({
      ...base,
      WOODPECKER_MCP_TRANSPORT: 'http',
      WOODPECKER_MCP_TOKEN: 'client-secret',
      WOODPECKER_MCP_PORT: '8080',
    });
    expect(config).toMatchObject({ transport: 'http', token: 'client-secret', port: 8080 });
  });

  it.each(['0', '65536', 'abc', '3000.5'])('rejects port %s', (port) => {
    expect(() => loadConfig({ ...base, WOODPECKER_MCP_PORT: port })).toThrow(/WOODPECKER_MCP_PORT/);
  });
});
