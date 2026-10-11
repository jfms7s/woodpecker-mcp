import type { WoodpeckerClient } from './client.js';
import { isoTime } from './shape.js';
import { RELEASE_VARIABLE, type WpPipeline, type WpRepo } from './types.js';

export const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
/** Woodpecker caps a page at 50. The poller pages the same way. */
export const PAGE_SIZE = 50;
export const MAX_PAGES = 20;

export function releaseMessage(tag: string): string {
  return `release ${tag}`;
}

export function defaultBranchOf(repo: WpRepo): string {
  if (!repo.default_branch) throw new Error(`Woodpecker reports no default branch for ${repo.full_name}`);
  return repo.default_branch;
}

export async function findReleaseRuns(
  client: Pick<WoodpeckerClient, 'listPipelines'>,
  repo: WpRepo,
  tag: string,
): Promise<WpPipeline[]> {
  const found: WpPipeline[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await client.listPipelines(repo.id, { event: 'manual', page, perPage: PAGE_SIZE });
    found.push(...batch.filter((p) => p.variables?.[RELEASE_VARIABLE] === tag));
    if (batch.length < PAGE_SIZE) break;
  }
  return found;
}

export interface ReleasePreview {
  started: false;
  confirmRequired: true;
  repo: string;
  branch: string;
  tag: string;
  previousRuns: Array<{ number: number; status: string; created?: string }>;
  note: string;
}

export async function previewRelease(
  client: Pick<WoodpeckerClient, 'listPipelines'>,
  repo: WpRepo,
  tag: string,
): Promise<ReleasePreview> {
  const branch = defaultBranchOf(repo);
  const runs = await findReleaseRuns(client, repo, tag);
  const earlier =
    runs.length > 0 ? `This tag already has ${runs.length} release run(s), listed in previousRuns. ` : '';
  return {
    started: false,
    confirmRequired: true,
    repo: repo.full_name,
    branch,
    tag,
    previousRuns: runs.map((p) => {
      const created = isoTime(p.created);
      return { number: p.number, status: p.status, ...(created ? { created } : {}) };
    }),
    note:
      `Nothing was started. Call again with confirm=true to run the ${tag} release on ${branch}. ` +
      earlier +
      "The tag itself isn't checked here: the release pipeline's clone step fails if it doesn't exist, " +
      'and a release pipeline that checks for an already-published image stops before publishing it again.',
  };
}
