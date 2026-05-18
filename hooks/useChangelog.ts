import { useCallback, useEffect, useState } from 'react';

export type ChangelogHighlightType = 'feature' | 'improvement' | 'fix';

export interface ChangelogHighlight {
  type: ChangelogHighlightType;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: ChangelogHighlight[];
}

interface ChangelogFile {
  entries: ChangelogEntry[];
}

const LAST_SEEN_KEY = 'whatsnew-last-seen';

export const useChangelog = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/changelog.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`changelog fetch failed: ${response.status}`);
        }
        const data = (await response.json()) as ChangelogFile;
        if (cancelled) return;
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const entriesSinceCurrent = useCallback(
    (currentVersion: string): ChangelogEntry[] => {
      if (entries.length === 0) return [];
      const idx = entries.findIndex((e) => e.version === currentVersion);
      if (idx === -1) return entries;
      return entries.slice(0, idx);
    },
    [entries]
  );

  const latestVersion = entries[0]?.version ?? null;

  return {
    entries,
    loading,
    error,
    latestVersion,
    entriesSinceCurrent,
  };
};

export const readLastSeenVersion = (): string | null => {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
};

export const writeLastSeenVersion = (version: string | null): void => {
  if (!version) return;
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // localStorage may be unavailable (private mode); silently no-op.
  }
};
