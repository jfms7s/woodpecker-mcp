export type TransportMode = 'stdio' | 'http' | 'both';

export interface WoodpeckerConnection {
  baseUrl: string;
  token: string;
}

export interface WoodpeckerMcpConfig {
  woodpecker: WoodpeckerConnection;
  transport: TransportMode;
  port: number;
  token?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const TRANSPORTS: readonly TransportMode[] = ['stdio', 'http', 'both'];

function readConnection(env: NodeJS.ProcessEnv): WoodpeckerConnection {
  const rawUrl = env.WOODPECKER_URL?.trim();
  const token = env.WOODPECKER_TOKEN?.trim();
  if (!rawUrl) throw new ConfigError('WOODPECKER_URL is required');
  if (!token) throw new ConfigError('WOODPECKER_TOKEN is required');

  try {
    new URL(rawUrl);
  } catch {
    throw new ConfigError(`WOODPECKER_URL is not a valid URL: ${rawUrl}`);
  }

  return { baseUrl: rawUrl.replace(/\/+$/, ''), token };
}

function readTransport(env: NodeJS.ProcessEnv): TransportMode {
  const raw = env.WOODPECKER_MCP_TRANSPORT?.trim();
  if (!raw) return 'stdio';
  if (!TRANSPORTS.includes(raw as TransportMode)) {
    throw new ConfigError(
      `WOODPECKER_MCP_TRANSPORT must be one of ${TRANSPORTS.join(', ')} (got: ${raw})`,
    );
  }
  return raw as TransportMode;
}

function readPort(env: NodeJS.ProcessEnv): number {
  const raw = env.WOODPECKER_MCP_PORT?.trim();
  if (!raw) return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`WOODPECKER_MCP_PORT must be an integer between 1 and 65535 (got: ${raw})`);
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WoodpeckerMcpConfig {
  const woodpecker = readConnection(env);
  const transport = readTransport(env);
  const token = env.WOODPECKER_MCP_TOKEN?.trim() || undefined;

  if ((transport === 'http' || transport === 'both') && !token) {
    throw new ConfigError(
      `WOODPECKER_MCP_TOKEN is required when WOODPECKER_MCP_TRANSPORT is "${transport}"`,
    );
  }

  return { woodpecker, transport, port: readPort(env), token };
}
