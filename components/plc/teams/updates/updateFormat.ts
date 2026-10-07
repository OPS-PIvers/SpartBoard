// Small formatters shared by the update views.

import type { PlcUpdate } from '@/types';

export const shortDate = (ms: number): string =>
  new Date(ms || Date.now()).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

export const reactionCount = (update: PlcUpdate): number =>
  Object.keys(update.reactions).length;
