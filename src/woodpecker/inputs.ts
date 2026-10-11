import { z } from 'zod';

export const repoInput = z
  .string()
  .min(1)
  .describe('Repository as "owner/name" (e.g. "jfms7s/budget-manager") or a numeric Woodpecker repo id');

export const pipelineNumber = z.number().int().positive().describe('Pipeline number, as shown in the Woodpecker UI');

export const confirmInput = z
  .boolean()
  .default(false)
  .describe('Must be true to actually start a release. Without it the tool only previews what would run.');
