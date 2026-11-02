import type { RandomConfig } from '@/types';

// The shuffle list's Current name: the first name in order that isn't done, locked or set aside.
export const currentShuffleName = (
  config: Pick<
    RandomConfig,
    'mode' | 'lastResult' | 'doneNames' | 'lockedNames' | 'unassignedNames'
  >
): string | null => {
  if (config.mode !== 'shuffle' || !Array.isArray(config.lastResult)) {
    return null;
  }
  const skip = new Set([
    ...(config.doneNames ?? []),
    ...(config.lockedNames ?? []),
    ...(config.unassignedNames ?? []),
  ]);
  for (const entry of config.lastResult) {
    if (typeof entry === 'string' && !skip.has(entry)) return entry;
  }
  return null;
};
