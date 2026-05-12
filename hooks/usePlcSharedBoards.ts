import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import type { SharedBoardIntendedMode } from '@/types';

/**
 * Lightweight view of a `/shared_boards/{shareId}` doc scoped to one PLC.
 * The full shared-board snapshot has a much larger surface (widgets,
 * participants, etc.); the PLC tab only needs a handful of header fields
 * for list rendering and the "Copy / Open" actions.
 */
export interface PlcSharedBoardEntry {
  /** Share doc id under `/shared_boards/{shareId}`. */
  id: string;
  /**
   * Display name of the dashboard at share time. Mirrors `Dashboard.name`.
   * Falls back to `''` for legacy/partial docs that predate name being
   * required — the tile / tab renders a placeholder in that case.
   */
  name: string;
  /** UID of the teacher who originated this share. Immutable post-create. */
  originalAuthor: string;
  /** Display-name snapshot of the originator at share time. May be `''`. */
  originalAuthorName: string;
  /** Share-time mode (`'synced' | 'view-only' | 'copy'`) chosen by the host. */
  intendedMode: SharedBoardIntendedMode | null;
  /** ms timestamp at first share. */
  sharedAt: number;
  /** ms timestamp; bumped by host/collaborator content writes. */
  updatedAt: number;
  /** Widget count at share time. Useful for the tile's "N widgets" subtitle. */
  widgetCount: number;
}

interface UsePlcSharedBoardsResult {
  boards: PlcSharedBoardEntry[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `boards`
   * array is "couldn't load," not "no items yet" — consumers should
   * distinguish so the UI doesn't render a misleading empty state.
   */
  error: Error | null;
}

const VALID_MODES: ReadonlySet<SharedBoardIntendedMode> = new Set([
  'synced',
  'view-only',
  'copy',
]);

function parseEntry(
  id: string,
  data: Record<string, unknown>
): PlcSharedBoardEntry | null {
  if (
    typeof data.originalAuthor !== 'string' ||
    typeof data.sharedAt !== 'number'
  ) {
    return null;
  }
  const rawMode = data.intendedMode;
  const intendedMode: SharedBoardIntendedMode | null =
    typeof rawMode === 'string' &&
    VALID_MODES.has(rawMode as SharedBoardIntendedMode)
      ? (rawMode as SharedBoardIntendedMode)
      : null;
  // `widgets` lives on the share doc as an array of WidgetData. Length is
  // cheap to compute defensively without parsing the whole array.
  const widgets = Array.isArray(data.widgets) ? data.widgets : [];
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    originalAuthor: data.originalAuthor,
    originalAuthorName:
      typeof data.originalAuthorName === 'string'
        ? data.originalAuthorName
        : '',
    intendedMode,
    sharedAt: data.sharedAt,
    updatedAt:
      typeof data.updatedAt === 'number' ? data.updatedAt : data.sharedAt,
    widgetCount: widgets.length,
  };
}

/**
 * Live subscription to all `/shared_boards` docs tagged with the given
 * `plcId`. Returns entries sorted newest-edit-first by `updatedAt`. Pass
 * `null` for `plcId` to disable the listener (e.g. while the dashboard
 * is closed).
 *
 * Read permission is already granted to all authenticated users by the
 * `/shared_boards` rule block; the PLC scope is implemented as a `where
 * plcId == ...` query filter, not a rule gate. This means a hostile
 * client could still list non-PLC shares by removing the filter — the
 * PLC tab uses the filter as a convenience pivot, not as a security
 * boundary.
 */
export const usePlcSharedBoards = (
  plcId: string | null
): UsePlcSharedBoardsResult => {
  const { user } = useAuth();
  const [boards, setBoards] = useState<PlcSharedBoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Render-time reset on plcId transitions — same pattern as
  // `usePlcAssignmentIndex` / `usePlcQuizzes`. Avoids flashing the
  // previous PLC's boards while the new snapshot is in flight.
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setBoards([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setBoards([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, 'shared_boards');
    const q = query(
      ref,
      where('plcId', '==', plcId),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PlcSharedBoardEntry[] = [];
        snap.forEach((d) => {
          const parsed = parseEntry(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        setBoards(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcSharedBoards.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  return useMemo(() => ({ boards, loading, error }), [boards, loading, error]);
};
