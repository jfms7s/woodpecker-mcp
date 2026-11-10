import { z } from 'zod';

export const repoInput = z
  .string()
  .min(1)
  .describe('Repository as "owner/name" (e.g. "jfms7s/budget-manager") or a numeric Woodpecker repo id');

const positiveInt = z.number().int().positive();

export const pipelineNumber = z
  .union([positiveInt, z.string().regex(/^\d+$/).transform(Number).pipe(positiveInt)])
  .describe('Pipeline number, as shown in the Woodpecker UI (a number or a numeric string)');

export const confirmInput = z
  .boolean()
  .default(false)
  .describe('Must be true to actually start a release. Without it the tool only previews what would run.');
