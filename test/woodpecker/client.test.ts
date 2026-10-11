import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createWoodpeckerHttpClient } from '../../src/http/client.js';
import { createWoodpeckerClient } from '../../src/woodpecker/client.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createWoodpeckerClient(createWoodpeckerHttpClient({ baseUrl: 'http://wp.test', token: 't' }));

function capturePost(url: string, reply: () => Response) {
  const seen: Array<{ body: string; search: string }> = [];
  server.use(
    http.post(url, async ({ request }) => {
      seen.push({ body: await request.text(), search: new URL(request.url).search });
      return reply();
    }),
  );
  return seen;
}

describe('createWoodpeckerClient', () => {
  it('looks a repo up by full name', async () => {
    server.use(http.get('http://wp.test/api/repos/lookup/jfms7s/budget-manager', () => HttpResponse.json({ id: 7 })));
    await expect(client.lookupRepo('jfms7s/budget-manager')).resolves.toEqual({ id: 7 });
  });

  it('treats null list bodies as empty lists', async () => {
    server.use(
      http.get('http://wp.test/api/user/repos', () => HttpResponse.json(null)),
      http.get('http://wp.test/api/repos/7/pipelines', () => HttpResponse.json(null)),
      http.get('http://wp.test/api/repos/7/pipelines/42/config', () => HttpResponse.json(null)),
      http.get('http://wp.test/api/repos/7/logs/42/9', () => HttpResponse.json(null)),
    );
    await expect(client.listRepos()).resolves.toEqual([]);
    await expect(client.listPipelines(7, { page: 1, perPage: 20 })).resolves.toEqual([]);
    await expect(client.getPipelineConfig(7, 42)).resolves.toEqual([]);
    await expect(client.getStepLogs(7, 42, 9)).resolves.toEqual([]);
  });

  it('passes pipeline filters as query parameters', async () => {
    let url: URL | undefined;
    server.use(
      http.get('http://wp.test/api/repos/7/pipelines', ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await client.listPipelines(7, { branch: 'feat/x', event: 'manual', status: 'failure', page: 2, perPage: 50 });
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      branch: 'feat/x',
      event: 'manual',
      status: 'failure',
      page: '2',
      perPage: '50',
    });
  });

  it('fetches the latest pipeline by the literal "latest"', async () => {
    server.use(http.get('http://wp.test/api/repos/7/pipelines/latest', () => HttpResponse.json({ number: 50 })));
    await expect(client.getPipeline(7, 'latest')).resolves.toEqual({ number: 50 });
  });

  it('starts a branch pipeline with a body of exactly {branch}', async () => {
    const seen = capturePost('http://wp.test/api/repos/7/pipelines', () => HttpResponse.json({ number: 43 }));
    await client.createPipeline(7, { branch: 'feat/x' });
    expect(seen).toEqual([{ body: JSON.stringify({ branch: 'feat/x' }), search: '' }]);
  });

  it('sends variables and message when given', async () => {
    const seen = capturePost('http://wp.test/api/repos/7/pipelines', () => HttpResponse.json({ number: 44 }));
    await client.createPipeline(7, { branch: 'main', variables: { RELEASE_TAG: 'v1.2.3' }, message: 'release v1.2.3' });
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({
      branch: 'main',
      variables: { RELEASE_TAG: 'v1.2.3' },
      message: 'release v1.2.3',
    });
  });

  it('reports a 204 start as undefined', async () => {
    capturePost('http://wp.test/api/repos/7/pipelines', () => new HttpResponse(null, { status: 204 }));
    await expect(client.createPipeline(7, { branch: 'main' })).resolves.toBeUndefined();
  });

  it('restarts with no body and no query string', async () => {
    const seen = capturePost('http://wp.test/api/repos/7/pipelines/42', () => HttpResponse.json({ number: 45 }));
    await expect(client.restartPipeline(7, 42)).resolves.toEqual({ number: 45 });
    expect(seen).toEqual([{ body: '', search: '' }]);
  });

  it('posts cancel, approve and decline to their own paths', async () => {
    const cancel = capturePost('http://wp.test/api/repos/7/pipelines/42/cancel', () => new HttpResponse(null, { status: 200 }));
    const approve = capturePost('http://wp.test/api/repos/7/pipelines/42/approve', () => HttpResponse.json({ number: 42 }));
    const decline = capturePost('http://wp.test/api/repos/7/pipelines/42/decline', () => HttpResponse.json({ number: 42 }));
    await client.cancelPipeline(7, 42);
    await client.approvePipeline(7, 42);
    await client.declinePipeline(7, 42);
    expect([cancel.length, approve.length, decline.length]).toEqual([1, 1, 1]);
  });
});
