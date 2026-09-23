import { createContext } from 'react';
import type { SubShareContentKind, SubstituteShareRoster } from '@/types';

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
  /**
   * Which board of the share is on screen. `launchSubAssignmentV1` checks the
   * widget against this board's snapshot, so a Launch needs it; a single-board
   * share has nothing bundled and so never reaches that path.
   */
  boardId: string | null;
  /**
   * The rosters the teacher attached to the share — the only classes a sub may
   * start an activity for (plan §3.6 step 4). These carry no class id, by
   * design: the callable resolves one from the teacher's own roster docs.
   */
  rosters: SubstituteShareRoster[];
  /** Resolves to the bundled payload, or null when nothing was bundled. */
  load: (kind: SubShareContentKind, itemId: string) => Promise<unknown>;
  /**
   * The same for an answer key, which only the subs this share names may read.
   * `denied` says the reader is not one of them, so the widget can say why the
   * quiz is not on screen rather than calling it missing.
   */
  loadKey: (
    kind: SubShareContentKind,
    itemId: string
  ) => Promise<{ payload: unknown; denied: boolean }>;
}

export const SubShareContentContext =
  createContext<SubShareContentValue | null>(null);
