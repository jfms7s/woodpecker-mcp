import { hasStatus } from '../http/errors.js';
import type { WoodpeckerClient } from './client.js';
import type { WpRepo } from './types.js';

export interface RepoResolver {
  resolve(repo: string): Promise<WpRepo>;
}

const ID = /^\d+$/;
const FULL_NAME = /^[^/\s]+\/[^/\s]+$/;

export function createRepoResolver(client: Pick<WoodpeckerClient, 'lookupRepo' | 'getRepo'>): RepoResolver {
  // For the life of the process: repo ids and names don't change under us,
  // and every tool call starts with a resolve.
  const cache = new Map<string, WpRepo>();

  const remember = (found: WpRepo): WpRepo => {
    cache.set(`id:${found.id}`, found);
    cache.set(`name:${found.full_name.toLowerCase()}`, found);
    return found;
  };

  const fetchOrExplain = async (ref: string, fetch: () => Promise<WpRepo>): Promise<WpRepo> => {
    try {
      return remember(await fetch());
    } catch (error) {
      if (hasStatus(error, 404)) throw new Error(`Woodpecker has no repo "${ref}" that the bot can see`);
      throw error;
    }
  };

  return {
    async resolve(input) {
      const ref = input.trim();
      if (ID.test(ref)) {
        const id = Number(ref);
        return cache.get(`id:${id}`) ?? fetchOrExplain(ref, () => client.getRepo(id));
      }
      if (FULL_NAME.test(ref)) {
        return cache.get(`name:${ref.toLowerCase()}`) ?? fetchOrExplain(ref, () => client.lookupRepo(ref));
      }
      throw new Error(`repo must be "owner/name" or a numeric Woodpecker repo id (got: "${input}")`);
    },
  };
}
