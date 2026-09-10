import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { StandardBenchmark } from '@/types';

const CATALOG_COLLECTION = 'standards_catalog';

export interface BenchmarkFilter {
  query: string;
  grade?: string;
  set?: string;
}

/** Client-side filter: every whitespace-separated term must appear in `searchText`. */
export function filterBenchmarks(
  benchmarks: StandardBenchmark[],
  filter: BenchmarkFilter
): StandardBenchmark[] {
  const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return benchmarks.filter((b) => {
    if (filter.grade && b.grade !== filter.grade) return false;
    if (filter.set && b.set !== filter.set) return false;
    return terms.every((term) => b.searchText.includes(term));
  });
}

let catalogPromise: Promise<StandardBenchmark[]> | null = null;

function loadCatalog(): Promise<StandardBenchmark[]> {
  catalogPromise ??= getDocs(collection(db, CATALOG_COLLECTION))
    .then((snap) => {
      const list: StandardBenchmark[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<StandardBenchmark, 'id'>;
        if (typeof data.code === 'string' && typeof data.text === 'string') {
          list.push({ ...data, id: d.id });
        }
      });
      list.sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })
      );
      return list;
    })
    .catch((err: unknown) => {
      // Drop the cache so a later mount can retry after a transient failure.
      catalogPromise = null;
      throw err;
    });
  return catalogPromise;
}

interface UseStandardsCatalogResult {
  benchmarks: StandardBenchmark[];
  loading: boolean;
  error: Error | null;
}

const EMPTY: StandardBenchmark[] = [];

/** Fetches `standards_catalog` once per session; the promise is shared across mounts. */
export function useStandardsCatalog(): UseStandardsCatalogResult {
  const [benchmarks, setBenchmarks] = useState<StandardBenchmark[]>(EMPTY);
  const [loading, setLoading] = useState(!isAuthBypass);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isAuthBypass) return;
    let cancelled = false;
    loadCatalog()
      .then((list) => {
        if (cancelled) return;
        setBenchmarks(list);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { benchmarks, loading, error };
}
