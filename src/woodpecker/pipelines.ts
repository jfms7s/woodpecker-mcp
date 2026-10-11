import { hasStatus } from '../http/errors.js';
import type { WoodpeckerClient } from './client.js';
import type { WpPipeline, WpRepo, WpStep } from './types.js';

export async function loadPipeline(
  client: Pick<WoodpeckerClient, 'getPipeline'>,
  repo: WpRepo,
  number: number | 'latest',
): Promise<WpPipeline> {
  try {
    return await client.getPipeline(repo.id, number);
  } catch (error) {
    if (!hasStatus(error, 404)) throw error;
    throw new Error(
      number === 'latest'
        ? `${repo.full_name} has no pipeline on its default branch yet`
        : `Pipeline ${number} not found in ${repo.full_name}`,
    );
  }
}

export function findStep(pipeline: WpPipeline, ref: string): WpStep {
  const entries = (pipeline.workflows ?? []).flatMap((w) =>
    (w.children ?? []).map((step) => ({ qualified: `${w.name}/${step.name}`, step })),
  );
  const wanted = ref.trim();
  const matches = /^\d+$/.test(wanted)
    ? entries.filter((e) => e.step.id === Number(wanted))
    : entries.filter((e) => e.step.name === wanted || e.qualified === wanted);

  const [only, ...others] = matches;
  if (only && others.length === 0) return only.step;

  const names = entries.map((e) => e.qualified).join(', ') || '(none)';
  if (!only) throw new Error(`No step "${ref}" in pipeline ${pipeline.number}. Steps: ${names}`);
  throw new Error(`Step name "${ref}" is in more than one workflow; use workflow/step. Steps: ${names}`);
}
