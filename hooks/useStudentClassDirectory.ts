import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, isAuthBypass } from '@/config/firebase';

/**
 * Class metadata returned by the `getStudentClassDirectoryV1` callable.
 * Mirror of the server type. Teacher names are the only personally-identifying
 * field — they are organizational data, NOT student PII.
 */
export interface ClassDirectoryEntry {
  classId: string;
  name: string;
  teacherDisplayName: string;
  subject?: string;
  code?: string;
}

export type DirectoryStatus = 'loading' | 'ready' | 'error';

export interface ClassDirectoryResult {
  status: DirectoryStatus;
  /** Resolved entries in the order returned by the server (may be a subset of classIds). */
  classes: ClassDirectoryEntry[];
  /** Lookup table keyed by classId for fast UI access. */
  byId: Record<string, ClassDirectoryEntry>;
  retry: () => void;
}

/**
 * Module-local cache so a remount of the page doesn't refetch what we
 * already have. Keyed by `${pseudonymUid}:${classIdsKey}`. Pseudonym
 * scoping flushes the cache on sign-out (a different student's session
 * would compute a different uid).
 */
const directoryCache = new Map<string, ClassDirectoryEntry[]>();

const cacheKeyOf = (pseudonymUid: string, classIdsKey: string): string =>
  `${pseudonymUid}:${classIdsKey}`;

/**
 * Bypass-mode mock — keeps the page render path consistent with real auth so
 * `pnpm run dev` with VITE_AUTH_BYPASS=true can exercise the new sidebar.
 */
const BYPASS_DIRECTORY: ClassDirectoryEntry[] = [
  {
    classId: 'mock-class-1',
    name: 'Demo Class',
    teacherDisplayName: 'Demo Teacher',
    subject: 'Demo',
  },
];

interface FetchedSnapshot {
  key: string;
  status: 'ready' | 'error';
  classes: ClassDirectoryEntry[];
}

interface UseStudentClassDirectoryArgs {
  classIds: readonly string[];
  pseudonymUid: string | null;
}

export function useStudentClassDirectory({
  classIds,
  pseudonymUid,
}: UseStudentClassDirectoryArgs): ClassDirectoryResult {
  const classIdsKey = useMemo(
    () => classIds.slice().sort().join('|'),
    [classIds]
  );

  // The cache key for the *current* (uid, classIds) pair. `null` means we
  // shouldn't fetch (bypass mode or no classes claimed).
  const cacheKey: string | null = useMemo(() => {
    if (isAuthBypass) return null;
    if (!pseudonymUid || classIds.length === 0) return null;
    return cacheKeyOf(pseudonymUid, classIdsKey);
  }, [pseudonymUid, classIds.length, classIdsKey]);

  // Async resolution snapshot. The effect writes this *after* the callable
  // settles — never synchronously, which avoids cascading renders. The
  // current cache state is read directly from `directoryCache` during render
  // so a fresh cache hit is reflected immediately without setState.
  const [fetched, setFetched] = useState<FetchedSnapshot | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Render-time resolution. Order:
  //   1. bypass / no claims  → instant 'ready'
  //   2. module cache hit    → instant 'ready' (fresh remount uses prior result)
  //   3. matching fetched    → reflect last async result for THIS key
  //   4. otherwise           → 'loading'
  const { status, classes } = ((): {
    status: DirectoryStatus;
    classes: ClassDirectoryEntry[];
  } => {
    if (isAuthBypass) {
      return { status: 'ready', classes: BYPASS_DIRECTORY };
    }
    if (cacheKey === null) {
      return { status: 'ready', classes: [] };
    }
    const cached = directoryCache.get(cacheKey);
    if (cached) {
      return { status: 'ready', classes: cached };
    }
    if (fetched && fetched.key === cacheKey) {
      return { status: fetched.status, classes: fetched.classes };
    }
    return { status: 'loading', classes: [] };
  })();

  useEffect(() => {
    if (cacheKey === null) return;
    if (directoryCache.has(cacheKey) && retryNonce === 0) return;

    let cancelled = false;
    const callable = httpsCallable<
      Record<string, never>,
      { classes?: ClassDirectoryEntry[] }
    >(functions, 'getStudentClassDirectoryV1');

    callable({})
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data?.classes)
          ? (res.data?.classes ?? [])
          : [];
        directoryCache.set(cacheKey, list);
        setFetched({ key: cacheKey, status: 'ready', classes: list });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: unknown }).code)
            : 'unknown';
        console.error(`[useStudentClassDirectory] callable failed [${code}]`);
        setFetched({ key: cacheKey, status: 'error', classes: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, retryNonce]);

  const byId = useMemo<Record<string, ClassDirectoryEntry>>(() => {
    const out: Record<string, ClassDirectoryEntry> = {};
    for (const c of classes) out[c.classId] = c;
    return out;
  }, [classes]);

  const retry = useCallback(() => {
    if (cacheKey !== null) directoryCache.delete(cacheKey);
    setRetryNonce((n) => n + 1);
  }, [cacheKey]);

  return { status, classes, byId, retry };
}
