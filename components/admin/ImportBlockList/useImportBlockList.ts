import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  DEFAULT_SEND_BLOCK_PATTERNS,
  resolveBlockPatterns,
} from '@/utils/import/sendBlockList';
import {
  IMPORT_READER_FAILURES_COLLECTION,
  IMPORT_SEND_BLOCK_LIST_DOC,
} from '@/utils/import/contract';
import { logError } from '@/utils/logError';
const READER_FAILURES_SHOWN = 50;

export interface BlockListState {
  patterns: readonly string[];
  // True while the district has never saved its own list.
  usingDefaults: boolean;
  loading: boolean;
}

/** The list the server enforces, and whether the district has saved its own. */
export function readBlockListDoc(data: unknown): {
  patterns: readonly string[];
  usingDefaults: boolean;
} {
  const saved = (data as { patterns?: unknown } | undefined)?.patterns;
  return {
    patterns: resolveBlockPatterns(data),
    usingDefaults: !Array.isArray(saved),
  };
}

export function useImportBlockList(): BlockListState {
  const [state, setState] = useState<BlockListState>({
    patterns: DEFAULT_SEND_BLOCK_PATTERNS,
    usingDefaults: true,
    loading: !isAuthBypass,
  });
  useEffect(() => {
    if (isAuthBypass) return;
    return onSnapshot(
      doc(db, 'admin_settings', IMPORT_SEND_BLOCK_LIST_DOC),
      (snap) => setState({ ...readBlockListDoc(snap.data()), loading: false }),
      (err) => {
        logError('useImportBlockList', err);
        setState((s) => ({ ...s, loading: false }));
      }
    );
  }, []);
  return state;
}

export interface ReaderFailure {
  id: string;
  platform: string;
  url: string;
  reason: string;
  createdAtMs: number | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const millis = (v: unknown): number | null => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function')
    return (v as { toMillis: () => number }).toMillis();
  return typeof v === 'number' ? v : null;
};

export function toReaderFailure(
  id: string,
  d: Record<string, unknown>
): ReaderFailure {
  return {
    id,
    platform: str(d.platform),
    url: str(d.url),
    reason: str(d.reason),
    createdAtMs: millis(d.createdAt),
  };
}

/** Newest reader failures, live. Admins only (rules). */
export function useReaderFailures(): {
  failures: ReaderFailure[];
  loading: boolean;
  error: boolean;
} {
  const [state, setState] = useState({
    failures: [] as ReaderFailure[],
    loading: !isAuthBypass,
    error: false,
  });
  useEffect(() => {
    if (isAuthBypass) return;
    return onSnapshot(
      query(
        collection(db, IMPORT_READER_FAILURES_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(READER_FAILURES_SHOWN)
      ),
      (snap) =>
        setState({
          failures: snap.docs.map((d) => toReaderFailure(d.id, d.data())),
          loading: false,
          error: false,
        }),
      (err) => {
        logError('useReaderFailures', err);
        setState({ failures: [], loading: false, error: true });
      }
    );
  }, []);
  return state;
}
