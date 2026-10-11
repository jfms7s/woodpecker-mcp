import type { WoodpeckerConnection } from '../config.js';
import { WoodpeckerApiError } from './errors.js';

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export interface WoodpeckerHttpClient {
  get<T>(path: string, query?: QueryParams): Promise<T>;
  /**
   * Deliberately takes no query parameters: on a pipeline restart Woodpecker
   * turns every unknown query key into a pipeline variable, so a query here
   * could smuggle RELEASE_TAG past the release guard.
   */
  post<T>(path: string, body?: unknown): Promise<T | undefined>;
}

const MAX_DETAIL = 200;

function truncate(text: string): string {
  const clean = text.trim();
  return clean.length > MAX_DETAIL ? `${clean.slice(0, MAX_DETAIL)}...` : clean;
}

function buildQuery(query: QueryParams | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

function extractDetail(status: number, raw: string): string {
  if (status === 401) {
    return 'Woodpecker rejected the token; check WOODPECKER_TOKEN and that the bot user still exists';
  }
  if (status === 403) {
    return 'the bot user lacks the permission this needs; pipeline actions need Write access on the GitHub repo';
  }
  if (!raw.trim()) return status >= 500 ? 'server error with no response body' : 'no response body';

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const message = record.message ?? record.error;
      if (typeof message === 'string' && message.length > 0) return truncate(message);
    }
  } catch {
    // fall through to the raw body
  }

  return truncate(raw);
}

interface RawResult {
  status: number;
  value: unknown;
}

export function createWoodpeckerHttpClient(connection: WoodpeckerConnection): WoodpeckerHttpClient {
  const { baseUrl, token } = connection;

  async function request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    query?: QueryParams,
  ): Promise<RawResult> {
    const apiPath = `/api${path}`;
    const url = `${baseUrl}${apiPath}${buildQuery(query)}`;

    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      const inner = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
      const detail = inner instanceof Error ? inner.message : String(inner);
      throw new WoodpeckerApiError({ baseUrl, method, path: apiPath, detail });
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw new WoodpeckerApiError({
        method,
        path: apiPath,
        status: response.status,
        detail: extractDetail(response.status, raw),
      });
    }

    if (response.status === 204) return { status: 204, value: undefined };

    const text = await response.text();
    if (!text.trim()) return { status: response.status, value: undefined };

    try {
      return { status: response.status, value: JSON.parse(text) as unknown };
    } catch {
      throw new WoodpeckerApiError({
        method,
        path: apiPath,
        status: response.status,
        detail: `response was not valid JSON: ${truncate(text)}`,
      });
    }
  }

  return {
    async get<T>(path: string, query?: QueryParams): Promise<T> {
      const { status, value } = await request('GET', path, undefined, query);
      if (value === undefined) {
        throw new WoodpeckerApiError({
          method: 'GET',
          path: `/api${path}`,
          status,
          detail: 'empty response where JSON was expected',
        });
      }
      return value as T;
    },
    async post<T>(path: string, body?: unknown): Promise<T | undefined> {
      const { value } = await request('POST', path, body);
      return value as T | undefined;
    },
  };
}
