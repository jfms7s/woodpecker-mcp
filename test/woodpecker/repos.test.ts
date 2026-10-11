import { describe, expect, it, vi } from 'vitest';
import { WoodpeckerApiError } from '../../src/http/errors.js';
import { createRepoResolver } from '../../src/woodpecker/repos.js';
import { fakeClient, repo } from './fixtures.js';

describe('createRepoResolver', () => {
  it('looks up owner/name and caches it', async () => {
    const client = fakeClient();
    const repos = createRepoResolver(client);
    await expect(repos.resolve('jfms7s/budget-manager')).resolves.toBe(repo);
    await repos.resolve('jfms7s/budget-manager');
    expect(client.lookupRepo).toHaveBeenCalledOnce();
    expect(client.lookupRepo).toHaveBeenCalledWith('jfms7s/budget-manager');
  });

  it('serves trimmed and differently-cased names, and the id, from the same cache entry', async () => {
    const client = fakeClient();
    const repos = createRepoResolver(client);
    await repos.resolve(' jfms7s/budget-manager ');
    await repos.resolve('JFMS7S/Budget-Manager');
    await repos.resolve('7');
    expect(client.lookupRepo).toHaveBeenCalledOnce();
    expect(client.getRepo).not.toHaveBeenCalled();
  });

  it('fetches a numeric id with getRepo', async () => {
    const client = fakeClient();
    await createRepoResolver(client).resolve('007');
    expect(client.getRepo).toHaveBeenCalledWith(7);
  });

  it.each(['budget-manager', 'https://github.com/jfms7s/budget-manager', 'a/b/c', ''])(
    'rejects %j before any HTTP call',
    async (input) => {
      const client = fakeClient();
      await expect(createRepoResolver(client).resolve(input)).rejects.toThrow(/"owner\/name" or a numeric/);
      expect(client.lookupRepo).not.toHaveBeenCalled();
      expect(client.getRepo).not.toHaveBeenCalled();
    },
  );

  it('turns a 404 into a sentence naming the repo', async () => {
    const client = fakeClient({
      lookupRepo: vi.fn(async () => {
        throw new WoodpeckerApiError({ method: 'GET', path: '/api/repos/lookup/x/y', status: 404, detail: 'x' });
      }),
    });
    await expect(createRepoResolver(client).resolve('x/y')).rejects.toThrow(
      'Woodpecker has no repo "x/y" that the bot can see',
    );
  });
});
