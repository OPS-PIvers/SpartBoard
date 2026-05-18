import { useCallback, useEffect, useState } from 'react';

export type ChangelogHighlightType = 'feature' | 'improvement' | 'fix';

// Used for the exhaustive details view (one bullet per user-facing change,
// grouped by type at render time — same shape as the legacy `highlights`).
export interface ChangelogHighlight {
  type: ChangelogHighlightType;
  text: string;
}

// Recursive bullet for the overview. `items` holds optional sub-bullets;
// by convention the Routine prompt caps nesting at one level deep.
export interface ChangelogBullet {
  text: string;
  items?: ChangelogBullet[];
}

// A themed section under a single type. `subtitle` is optional so
// theme-less sections (e.g. flat Fixes with no concept grouping)
// fall out naturally — the renderer just prints the bullets directly
// under the type heading when `subtitle` is missing.
export interface ChangelogThemedSection {
  type: ChangelogHighlightType;
  subtitle?: string;
  items: ChangelogBullet[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  overview?: ChangelogThemedSection[];
  details: ChangelogHighlight[];
}

interface ChangelogFile {
  entries: ChangelogEntry[];
}

const LAST_SEEN_KEY = 'whatsnew-last-seen';
const WHATSNEW_SEEN_EVENT = 'whatsnew-seen';
const CHANGELOG_ENDPOINT = '/changelog.json';
const FETCH_TIMEOUT_MS = 5000;

// Module-level cache so concurrent consumers (sidebar + modal) share a single
// in-flight request rather than each hitting the network. Reset on failure
// so the next mount can retry.
let changelogPromise: Promise<ChangelogFile> | null = null;

const fetchChangelog = (): Promise<ChangelogFile> => {
  if (changelogPromise) return changelogPromise;

  const url = new URL(CHANGELOG_ENDPOINT, window.location.origin);
  url.searchParams.set('t', Date.now().toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  changelogPromise = fetch(url, {
    cache: 'no-store',
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`changelog fetch failed: ${res.status}`);
      }
      return res.json() as Promise<ChangelogFile>;
    })
    .catch((err: unknown) => {
      clearTimeout(timeoutId);
      changelogPromise = null;
      throw err;
    });

  return changelogPromise;
};

export const useChangelog = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChangelog()
      .then((data) => {
        if (cancelled) return;
        const next = Array.isArray(data.entries) ? data.entries : [];
        // entriesSinceCurrent assumes newest-first ordering. Warn loudly if
        // the curator accidentally appended a new entry at the bottom.
        for (let i = 0; i < next.length - 1; i += 1) {
          if (next[i].date < next[i + 1].date) {
            console.warn(
              `changelog.json entries appear out of order at index ${i}: ` +
                `"${next[i].version}" (${next[i].date}) should not precede ` +
                `"${next[i + 1].version}" (${next[i + 1].date}). ` +
                `Entries must be newest-first.`
            );
            break;
          }
        }
        setEntries(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Entries are expected newest-first; this returns everything before the
  // user's current version (i.e. newer than their build). Returns all entries
  // when the user's version isn't found, which covers users coming from a
  // pre-changelog build.
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
  // Notify same-tab listeners. Cross-tab is handled via the native `storage`
  // event, which fires automatically on other tabs after setItem succeeds.
  try {
    window.dispatchEvent(
      new CustomEvent(WHATSNEW_SEEN_EVENT, { detail: version })
    );
  } catch {
    // CustomEvent unavailable in some non-browser test envs; ignore.
  }
};

export const WHATSNEW_SEEN_EVENT_NAME = WHATSNEW_SEEN_EVENT;
export const WHATSNEW_LAST_SEEN_STORAGE_KEY = LAST_SEEN_KEY;

// Test-only: clears the module-level fetch cache so each test gets a fresh
// network call. Production code should never need this.
export const __resetChangelogCacheForTests = (): void => {
  changelogPromise = null;
};
