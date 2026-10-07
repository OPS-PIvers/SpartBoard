// Which doc the `doc` hero shows.

import type { PlcDoc } from '@/types';

/** The pinned doc when it still exists, else the newest live doc. */
export function pickHeroDoc(
  docs: readonly PlcDoc[],
  docId: string | null
): PlcDoc | null {
  const live = docs.filter((d) => d.deletedAt == null);
  const pinned = docId ? live.find((d) => d.id === docId) : undefined;
  if (pinned) return pinned;
  return live.reduce<PlcDoc | null>(
    (newest, d) => (!newest || d.updatedAt > newest.updatedAt ? d : newest),
    null
  );
}
