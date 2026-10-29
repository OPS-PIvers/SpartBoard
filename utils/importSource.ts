import type { ImportSource } from '@/types';

/** One key per source item, stored on library metadata so a re-import can find its copy. */
export const importSourceKey = (
  source: Pick<ImportSource, 'system' | 'kind' | 'itemId'>
): string => `${source.system}:${source.kind}:${source.itemId}`;
