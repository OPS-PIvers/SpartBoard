// One listener plus share, unshare and restore for every PLC library kind.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  usePlcSubcollection,
  type PlcSlice,
  type PlcStoreState,
} from '@/context/usePlcContext';
import { logError } from '@/utils/logError';

const PLCS_COLLECTION = 'plcs';

export type PlcLibraryKind =
  'quiz' | 'videoActivity' | 'rubric' | 'flashcards' | 'questionBank';

type PlcStorePick<T> = (s: PlcStoreState) => PlcSlice<T[]> | null;

/** Function declaration so specs built at module load survive import cycles. */
export function isLivePlcLibraryEntry(entry: {
  deletedAt?: number | null;
}): boolean {
  return entry.deletedAt == null;
}

export interface PlcLibrarySpec<T, S = never, R = void> {
  kind: PlcLibraryKind;
  subcollection: string;
  parse: (id: string, data: Record<string, unknown>) => T | null;
  /** Rows the live library shows (tombstones dropped). */
  keep: (item: T) => boolean;
  /** Server-side `orderBy('updatedAt', 'desc')`; false lists unordered and sorts with `sort`. */
  orderByUpdatedAt: boolean;
  sort?: (a: T, b: T) => number;
  /** Read a mounted PlcProvider's slice instead of opening a second listener. */
  fromProvider?: PlcStorePick<T>;
  share?: (plcId: string, uid: string, input: S) => Promise<R>;
}

export interface PlcSubscriptionOptions<T> {
  orderByUpdatedAt?: boolean;
  sort?: (a: T, b: T) => number;
  logTag?: string;
  /** Skip the listener (a provider already supplies the data). */
  disabled?: boolean;
}

const noProvider = (): null => null;

/** Live, parsed rows of `plcs/{plcId}/{sub}`, reset in render when the PLC changes. */
export function usePlcSubscription<T>(
  plcId: string | null,
  sub: string,
  parse: (id: string, data: Record<string, unknown>) => T | null,
  keep: (item: T) => boolean,
  options: PlcSubscriptionOptions<T> = {}
): { items: T[]; loading: boolean; error: Error | null } {
  const { orderByUpdatedAt = true, sort, logTag, disabled = false } = options;
  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setItems([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (disabled) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setItems([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, sub);
    return onSnapshot(
      orderByUpdatedAt ? query(ref, orderBy('updatedAt', 'desc')) : ref,
      (snap) => {
        const list: T[] = [];
        snap.forEach((d) => {
          const parsed = parse(d.id, d.data());
          if (parsed && keep(parsed)) list.push(parsed);
        });
        if (sort) list.sort(sort);
        setItems(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError(logTag ?? `usePlcSubscription.${sub}`, err, { plcId });
        // Clear like PlcProvider does, so a lost membership never leaves stale rows.
        setItems([]);
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
  }, [plcId, user, sub, parse, keep, orderByUpdatedAt, sort, logTag, disabled]);

  return { items, loading, error };
}

/** Soft delete (Decision 3.1): tombstone only, identity and attribution untouched. */
export async function softDeletePlcLibraryEntry(
  plcId: string,
  subcollection: string,
  id: string
): Promise<void> {
  const now = Date.now();
  await updateDoc(doc(db, PLCS_COLLECTION, plcId, subcollection, id), {
    deletedAt: now,
    updatedAt: now,
  });
}

/** Clear the tombstone and bump `updatedAt` so the row resurfaces at the top. */
export async function restorePlcLibraryEntry(
  plcId: string,
  subcollection: string,
  id: string
): Promise<void> {
  await updateDoc(doc(db, PLCS_COLLECTION, plcId, subcollection, id), {
    deletedAt: null,
    updatedAt: Date.now(),
  });
}

export interface UsePlcLibraryEntriesResult<T, S, R> {
  entries: T[];
  loading: boolean;
  /** Non-null means an empty list is "couldn't load", not "nothing shared". */
  error: Error | null;
  share: (input: S) => Promise<R>;
  unshare: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

export function usePlcLibraryEntries<T, S = never, R = void>(
  plcId: string | null,
  spec: PlcLibrarySpec<T, S, R>
): UsePlcLibraryEntriesResult<T, S, R> {
  const { user } = useAuth();
  const fromProvider = usePlcSubcollection<T[]>(
    plcId,
    spec.fromProvider ?? noProvider
  );
  const own = usePlcSubscription(
    plcId,
    spec.subcollection,
    spec.parse,
    spec.keep,
    {
      orderByUpdatedAt: spec.orderByUpdatedAt,
      sort: spec.sort,
      logTag: `usePlcLibraryEntries.${spec.kind}`,
      disabled: !!fromProvider,
    }
  );
  const resolved: Omit<PlcSlice<T[]>, 'enabled'> = fromProvider ?? {
    data: own.items,
    loading: own.loading,
    error: own.error,
  };

  const { subcollection, share: shareSpec } = spec;
  const share = useCallback(
    async (input: S): Promise<R> => {
      if (!plcId || !user) throw new Error('Not signed in');
      if (!shareSpec) throw new Error('Sharing is not supported here');
      return shareSpec(plcId, user.uid, input);
    },
    [plcId, user, shareSpec]
  );
  const unshare = useCallback(
    async (id: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await softDeletePlcLibraryEntry(plcId, subcollection, id);
    },
    [plcId, user, subcollection]
  );
  const restore = useCallback(
    async (id: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await restorePlcLibraryEntry(plcId, subcollection, id);
    },
    [plcId, user, subcollection]
  );

  const { data, loading, error } = resolved;
  return useMemo(
    () => ({ entries: data, loading, error, share, unshare, restore }),
    [data, loading, error, share, unshare, restore]
  );
}
