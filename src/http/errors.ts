export interface WoodpeckerApiErrorOptions {
  method: string;
  path: string;
  status?: number;
  detail: string;
  /** Configured base URL, named only when the connection never landed. */
  baseUrl?: string;
}

/** Drops any userinfo before a base URL goes into a message; an unparseable URL is dropped entirely. */
function safeBaseUrl(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    if (!url.username && !url.password) return baseUrl;
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export class WoodpeckerApiError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly detail: string;

  constructor(options: WoodpeckerApiErrorOptions) {
    const { method, path, status, detail, baseUrl } = options;
    // The URL only helps when the request never arrived; once a status comes
    // back the server was plainly reachable.
    const at = baseUrl === undefined ? undefined : safeBaseUrl(baseUrl);
    const target = at === undefined ? 'Woodpecker' : `Woodpecker at ${at}`;
    const message =
      status === undefined
        ? `Cannot reach ${target} for ${method} ${path}: ${detail}`
        : `Woodpecker returned ${status} for ${method} ${path}: ${detail}`;
    super(message);
    this.name = 'WoodpeckerApiError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.detail = detail;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function hasStatus(error: unknown, status: number): boolean {
  return error instanceof WoodpeckerApiError && error.status === status;
}
