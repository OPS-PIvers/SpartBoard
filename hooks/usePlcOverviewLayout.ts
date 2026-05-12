import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  DEFAULT_PLC_OVERVIEW_LAYOUT,
  PLC_BENTO_TILE_KINDS,
  PLC_BENTO_TILE_SIZES,
  PlcBentoTile,
  PlcBentoTileKind,
  PlcBentoTileSize,
  PlcGridCoords,
  PlcOverviewLayout,
} from '@/types';
import { migrateLayoutToCoords } from '@/components/plc/grid/tileGridMath';
import { logError } from '@/utils/logError';

const USERS_COLLECTION = 'users';
const LAYOUTS_SUBCOLLECTION = 'plc_layouts';

const DEBOUNCE_MS = 500;

interface UsePlcOverviewLayoutResult {
  /** The merged layout — defaults overlaid with any persisted user customization. */
  layout: PlcOverviewLayout;
  loading: boolean;
  /** Replace the full layout. Debounced (~500ms) — successive calls coalesce. */
  updateLayout: (next: PlcOverviewLayout) => void;
  /** Reset to defaults. Writes immediately, no debounce. */
  resetLayout: () => Promise<void>;
}

function parseCoords(raw: unknown): PlcGridCoords | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const { x, y, w, h } = obj;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number'
  ) {
    return undefined;
  }
  return { x, y, w, h };
}

function parseTile(raw: unknown): PlcBentoTile | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== 'string') return null;
  if (!PLC_BENTO_TILE_KINDS.includes(kind as PlcBentoTileKind)) return null;

  const tile: PlcBentoTile = { kind: kind as PlcBentoTileKind };

  // Legacy v1 size is optional now — kept on the tile for back-compat
  // until a future cleanup pass.
  if (typeof obj.size === 'string') {
    if (PLC_BENTO_TILE_SIZES.includes(obj.size as PlcBentoTileSize)) {
      tile.size = obj.size as PlcBentoTileSize;
    }
  }

  const coords = parseCoords(obj.coords);
  if (coords) tile.coords = coords;

  // A tile must carry at least ONE of {size, coords} so the migrator can
  // derive grid placement. For a known kind (one we ship a default for)
  // we recover by stamping the default size from `DEFAULT_PLC_OVERVIEW_LAYOUT`
  // — the user's hidden/customized tile shouldn't vanish just because its
  // shape got truncated. Unknown kinds are dropped.
  if (!tile.size && !tile.coords) {
    const defaultEntry = DEFAULT_PLC_OVERVIEW_LAYOUT.tiles.find(
      (t) => t.kind === tile.kind
    );
    if (!defaultEntry?.size) return null;
    tile.size = defaultEntry.size;
  }

  if (typeof obj.hidden === 'boolean') tile.hidden = obj.hidden;
  return tile;
}

/**
 * Merge a (possibly partial) persisted layout against the default tile set
 * so newly added tile kinds appear automatically without forcing a layout
 * reset. Persisted entries are kept in their stored order; any unseen
 * default tiles are appended at the end.
 */
function mergeLayout(persisted: PlcBentoTile[]): PlcBentoTile[] {
  const seen = new Set<PlcBentoTileKind>();
  const merged: PlcBentoTile[] = [];
  for (const tile of persisted) {
    if (seen.has(tile.kind)) continue;
    seen.add(tile.kind);
    merged.push(tile);
  }
  for (const fallback of DEFAULT_PLC_OVERVIEW_LAYOUT.tiles) {
    if (seen.has(fallback.kind)) continue;
    merged.push({ ...fallback });
    seen.add(fallback.kind);
  }
  return merged;
}

function parseLayout(data: Record<string, unknown>): PlcOverviewLayout {
  const tilesRaw = Array.isArray(data.tiles) ? data.tiles : [];
  const tiles: PlcBentoTile[] = [];
  for (const entry of tilesRaw) {
    const parsed = parseTile(entry);
    if (parsed) tiles.push(parsed);
  }
  const updatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
  // Stamp every tile with `coords` (derived from legacy `size` if needed)
  // so v2 grid renderers can rely on them without a per-render fallback.
  // The first write-back persists these — see `updateLayout`.
  const merged = migrateLayoutToCoords(mergeLayout(tiles));
  return { tiles: merged, updatedAt };
}

/**
 * Per-user PLC dashboard bento-grid layout. Reads `users/{uid}/plc_layouts/{plcId}`
 * via `onSnapshot`; falls back to `DEFAULT_PLC_OVERVIEW_LAYOUT` when no doc
 * exists. Writes are debounced (~500ms) — sequential drag/resize
 * interactions coalesce into one Firestore write. `resetLayout` writes
 * immediately because it's an explicit user action.
 *
 * Pass `null` for `plcId` to skip the listener (e.g. while the dashboard
 * is closed). Mirrors the `enabled`/`null` gating pattern in
 * `usePlcs.ts` / `usePlcAssignmentIndex.ts`.
 */
export const usePlcOverviewLayout = (
  plcId: string | null
): UsePlcOverviewLayoutResult => {
  const { user } = useAuth();
  const [layout, setLayout] = useState<PlcOverviewLayout>(
    DEFAULT_PLC_OVERVIEW_LAYOUT
  );
  const [loading, setLoading] = useState(true);

  // Track local writes so an in-flight snapshot doesn't clobber a tile
  // the user just rearranged. We compare timestamps before accepting a
  // remote snapshot — only newer (or equal+different content) wins.
  const lastLocalWriteRef = useRef<number>(0);

  // Debounce timer for `updateLayout`. Ref-held so a re-render doesn't
  // restart the clock unintentionally; cleared on unmount or PLC change.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWriteRef = useRef<PlcOverviewLayout | null>(null);

  // Reset on plcId change so we don't render the previous PLC's layout
  // while the new snapshot is in flight. Same "adjust state during render"
  // pattern as usePlcAssignmentIndex. Ref-side cleanup happens in the
  // listener-effect's cleanup below (the lint rule forbids mutating refs
  // during render).
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setLayout(DEFAULT_PLC_OVERVIEW_LAYOUT);
    setLoading(true);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setLayout(DEFAULT_PLC_OVERVIEW_LAYOUT);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = doc(
      db,
      USERS_COLLECTION,
      user.uid,
      LAYOUTS_SUBCOLLECTION,
      plcId
    );
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLayout(DEFAULT_PLC_OVERVIEW_LAYOUT);
          setLoading(false);
          return;
        }
        const parsed = parseLayout(snap.data() as Record<string, unknown>);
        // Don't clobber a fresher local write that hasn't flushed yet.
        if (parsed.updatedAt < lastLocalWriteRef.current) {
          setLoading(false);
          return;
        }
        setLayout(parsed);
        setLoading(false);
      },
      (err) => {
        logError('usePlcOverviewLayout.snapshot', err, { plcId });
        setLoading(false);
      }
    );
    // Cleanup on unmount OR plcId/user change: tear down the listener AND
    // flush any pending debounced write so a fast tab-close (or PLC swap)
    // doesn't drop the user's last rearrangement. Also resets local-write
    // tracking so the next PLC's snapshot isn't shadowed by the old
    // PLC's `lastLocalWriteRef`.
    return () => {
      unsub();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const pending = pendingWriteRef.current;
      if (pending && !isAuthBypass) {
        // Fire-and-forget — cleanup can't await. The `void` is intentional.
        void setDoc(ref, pending).catch((err: unknown) => {
          logError('usePlcOverviewLayout.flush', err, { plcId });
        });
      }
      pendingWriteRef.current = null;
      lastLocalWriteRef.current = 0;
    };
  }, [plcId, user]);

  const updateLayout = useCallback(
    (next: PlcOverviewLayout) => {
      const stamped: PlcOverviewLayout = {
        tiles: next.tiles,
        updatedAt: Date.now(),
      };
      lastLocalWriteRef.current = stamped.updatedAt;
      setLayout(stamped);
      pendingWriteRef.current = stamped;

      if (!plcId || !user || isAuthBypass) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        const pending = pendingWriteRef.current;
        debounceTimerRef.current = null;
        if (!pending) return;
        pendingWriteRef.current = null;
        const ref = doc(
          db,
          USERS_COLLECTION,
          user.uid,
          LAYOUTS_SUBCOLLECTION,
          plcId
        );
        void setDoc(ref, pending).catch((err: unknown) => {
          logError('usePlcOverviewLayout.write', err, { plcId });
        });
      }, DEBOUNCE_MS);
    },
    [plcId, user]
  );

  const resetLayout = useCallback(async () => {
    if (!plcId || !user || isAuthBypass) {
      setLayout(DEFAULT_PLC_OVERVIEW_LAYOUT);
      return;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingWriteRef.current = null;
    const stamped: PlcOverviewLayout = {
      tiles: DEFAULT_PLC_OVERVIEW_LAYOUT.tiles.map((t) => ({ ...t })),
      updatedAt: Date.now(),
    };
    lastLocalWriteRef.current = stamped.updatedAt;
    setLayout(stamped);
    const ref = doc(
      db,
      USERS_COLLECTION,
      user.uid,
      LAYOUTS_SUBCOLLECTION,
      plcId
    );
    try {
      await setDoc(ref, stamped);
    } catch (err) {
      logError('usePlcOverviewLayout.reset', err, { plcId });
      throw err;
    }
  }, [plcId, user]);

  return useMemo(
    () => ({ layout, loading, updateLayout, resetLayout }),
    [layout, loading, updateLayout, resetLayout]
  );
};
