/**
 * Where a sub share keeps the data its widgets cannot reach.
 *
 * A board snapshot only carries widget config. Anything a widget loads from
 * the teacher's own `users/` tree or Drive — a Drawing's strokes, a notebook,
 * a Next Up queue — is bundled at share time into `content/`, and answer keys
 * and full activity copies into `keys/`, which is read-gated to the subs the
 * share names. Both are reaped with the parent when the share ends.
 */

import type { SubShareContentKind } from '@/types';

/** Sub-collections of a `/shared_collections/{shareId}` doc, in sweep order. */
export const SHARE_SUBCOLLECTIONS = ['boards', 'content', 'keys'] as const;

/** Doc id for a bundled item. One item shared twice is bundled once. */
export function subShareContentId(
  kind: SubShareContentKind,
  itemId: string
): string {
  return `${kind}_${itemId}`;
}
