import { createContext } from 'react';
import type { SubShareContentKind } from '@/types';

/**
 * The bundled content of the share a board is being viewed inside. Only the
 * `/subs` portal provides it: everywhere else a widget's data is the signed-in
 * user's own, and the hook that reads this returns "not in a share" so the
 * ordinary path is untouched.
 */
export interface SubShareContentValue {
  shareId: string;
  /** The content version on screen; a teacher's push bumps it. */
  version: number;
  /** Resolves to the bundled payload, or null when nothing was bundled. */
  load: (kind: SubShareContentKind, itemId: string) => Promise<unknown>;
}

export const SubShareContentContext =
  createContext<SubShareContentValue | null>(null);
