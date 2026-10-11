import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createWoodpeckerHttpClient } from '../../src/http/client.js';
import { WoodpeckerApiError } from '../../src/http/errors.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createWoodpeckerHttpClient({ baseUrl: 'http://wp.test', token: 'bot-token' });

async function failure(promise: Promise<unknown>): Promise<WoodpeckerApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(WoodpeckerApiError);
  return error as WoodpeckerApiError;
}

describe('createWoodpeckerHttpClient', () => {
  it('sends the bearer token and prefixes /api', async () => {
    let auth: string | null = null;
    server.use(
      http.get('http://wp.test/api/user/repos', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json([{ id: 1 }]);
      }),
    );
    await expect(client.get('/user/repos')).resolves.toEqual([{ id: 1 }]);
    expect(auth).toBe('Bearer bot-token');
  });

  it('serialises query parameters and drops undefined and null', async () => {
    let url: URL | undefined;
    server.use(
      http.get('http://wp.test/api/repos/7/pipelines', ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await client.get('/repos/7/pipelines', { page: 2, perPage: 50, branch: undefined, event: null });
    expect(url?.searchParams.get('page')).toBe('2');
    expect(url?.searchParams.get('perPage')).toBe('50');
    expect(url?.searchParams.has('branch')).toBe(false);
    expect(url?.searchParams.has('event')).toBe(false);
  });

  it('posts a JSON body and never adds a query string', async () => {
    let seen: { body: unknown; search: string; type: string | null } | undefined;
    server.use(
      http.post('http://wp.test/api/repos/7/pipelines', async ({ request }) => {
        seen = {
          body: await request.json(),
          search: new URL(request.url).search,
          type: request.headers.get('Content-Type'),
        };
        return HttpResponse.json({ number: 43 });
      }),
    );
    await expect(client.post('/repos/7/pipelines', { branch: 'main' })).resolves.toEqual({ number: 43 });
    expect(seen).toEqual({ body: { branch: 'main' }, search: '', type: 'application/json' });
  });

  it('posts with no body at all when none is given', async () => {
    let raw: string | undefined;
    server.use(
      http.post('http://wp.test/api/repos/7/pipelines/42', async ({ request }) => {
        raw = await request.text();
        return HttpResponse.json({ number: 44 });
      }),
    );
    await client.post('/repos/7/pipelines/42');
    expect(raw).toBe('');
  });

  it('returns undefined for 204 No Content', async () => {
    server.use(http.post('http://wp.test/api/repos/7/pipelines', () => new HttpResponse(null, { status: 204 })));
    await expect(client.post('/repos/7/pipelines', { branch: 'main' })).resolves.toBeUndefined();
  });

  it('returns null bodies as null so callers can treat them as empty lists', async () => {
    server.use(http.get('http://wp.test/api/repos/7/pipelines', () => HttpResponse.json(null)));
    await expect(client.get('/repos/7/pipelines')).resolves.toBeNull();
  });

  it('explains a 401 in terms of the token', async () => {
    server.use(http.get('http://wp.test/api/user/repos', () => new HttpResponse(null, { status: 401 })));
    const error = await failure(client.get('/user/repos'));
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/rejected the token.*WOODPECKER_TOKEN/);
  });

  it('explains a 403 in terms of the bot user permission', async () => {
    server.use(http.post('http://wp.test/api/repos/7/pipelines', () => new HttpResponse(null, { status: 403 })));
    const error = await failure(client.post('/repos/7/pipelines', { branch: 'main' }));
    expect(error.message).toMatch(/Write access on the GitHub repo/);
  });

  it('uses a plain-text error body as the detail', async () => {
    server.use(
      http.post('http://wp.test/api/repos/7/pipelines', () =>
        HttpResponse.text('failed to load branch head', { status: 500 }),
      ),
    );
    const error = await failure(client.post('/repos/7/pipelines', { branch: 'gone' }));
    expect(error.message).toBe('Woodpecker returned 500 for POST /api/repos/7/pipelines: failed to load branch head');
  });

  it('uses a JSON message field as the detail', async () => {
    server.use(
      http.get('http://wp.test/api/repos/7/pipelines/9', () =>
        HttpResponse.json({ message: 'pipeline not found' }, { status: 404 }),
      ),
    );
    const error = await failure(client.get('/repos/7/pipelines/9'));
    expect(error.detail).toBe('pipeline not found');
  });

  it('rejects an empty GET body', async () => {
    server.use(http.get('http://wp.test/api/user/repos', () => new HttpResponse('', { status: 200 })));
    const error = await failure(client.get('/user/repos'));
    expect(error.detail).toMatch(/empty response/);
  });

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('http://wp.test/api/user/repos', () => HttpResponse.text('<html>', { status: 200 })));
    const error = await failure(client.get('/user/repos'));
    expect(error.detail).toMatch(/not valid JSON/);
  });
});
