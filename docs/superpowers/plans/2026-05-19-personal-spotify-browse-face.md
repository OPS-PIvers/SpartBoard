# Personal Spotify browse-and-play face — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty front face of the Music widget's personal-Spotify mode with a tabbed Browse-and-Play UI (Playlists · Search · Now Playing), so connecting Spotify is immediately useful instead of leaving the teacher at an empty card.

**Architecture:** A new `PersonalSpotifyBrowser` top-level component owns three lazy-mounted tab views (Library/Search/Now Playing). A new `useSpotifyLibrary` hook owns the cached fetch of the teacher's playlists and recently played tracks via two new utility functions. Tap-to-play is hoisted; the current tab doesn't auto-switch, but the Now Playing tab gets a green-dot indicator. Three new OAuth scopes are added in lockstep on frontend and backend so partial-consent enforcement stays honest. The existing iframe-embed fallback for Free users is preserved inside the Now Playing tab.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, Tailwind CSS, Lucide icons, Firebase Functions for OAuth backend, Spotify Web API + Web Playback SDK.

**Spec:** `docs/superpowers/specs/2026-05-19-personal-spotify-browse-face-design.md`

---

## Pre-flight

Work in the `dev-paul-review-fixes` worktree at `C:\Users\paul.ivers\Desktop\SpartBoard\.claude\worktrees\dev-paul-review-fixes`. Branch is `dev-paul`. Pull latest before starting:

```bash
git pull --ff-only origin dev-paul
```

Each task ends in a commit on `dev-paul`. Push at natural breakpoints (after a tab is fully wired, after the dispatcher swap, after final settings simplification). Final push triggers `firebase-dev-deploy.yml` which rebuilds the dev preview URL.

After every code task: `pnpm run validate` must pass before committing. Don't push commits that fail lint, format, or type-check (CLAUDE.md is firm on this).

---

### Task 1: Add new OAuth scopes (frontend + backend in lockstep)

The backend rejects exchange if granted scopes don't match `REQUIRED_SPOTIFY_SCOPES`. Frontend and backend lists must change together.

**Files:**

- Modify: `utils/spotifyAuth.ts` (scope list, ~line 26)
- Modify: `functions/src/spotifyOAuth.ts` (REQUIRED_SPOTIFY_SCOPES, ~line 37)
- Test: `tests/utils/spotifyAuthScopes.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/utils/spotifyAuthScopes.test.ts`:

```ts
/**
 * Scope list is consumed by both the auth-URL builder (frontend) and the
 * token-exchange validator (backend, kept in sync via REQUIRED_SPOTIFY_SCOPES).
 * If the two drift, partial-consent enforcement breaks silently.
 */
import { describe, it, expect } from 'vitest';
import { SPOTIFY_SCOPES } from '@/utils/spotifyAuth';

describe('SPOTIFY_SCOPES', () => {
  it('includes the three Library-API scopes the browse face requires', () => {
    expect(SPOTIFY_SCOPES).toContain('user-read-recently-played');
    expect(SPOTIFY_SCOPES).toContain('playlist-read-private');
    expect(SPOTIFY_SCOPES).toContain('playlist-read-collaborative');
  });

  it('still includes the original playback scopes', () => {
    expect(SPOTIFY_SCOPES).toContain('streaming');
    expect(SPOTIFY_SCOPES).toContain('user-modify-playback-state');
    expect(SPOTIFY_SCOPES).toContain('user-read-playback-state');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/spotifyAuthScopes.test.ts
```

Expected: FAIL on the three new-scope assertions.

- [ ] **Step 3: Update the frontend scope list**

In `utils/spotifyAuth.ts`, find the `SPOTIFY_SCOPES` declaration (around line 26) and add the three new scopes:

```ts
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
] as const;
```

- [ ] **Step 4: Update the backend scope list in lockstep**

In `functions/src/spotifyOAuth.ts`, find `REQUIRED_SPOTIFY_SCOPES` (around line 37) and add the same three:

```ts
const REQUIRED_SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
];
```

- [ ] **Step 5: Run test to verify pass + run validate**

```bash
pnpm vitest run tests/utils/spotifyAuthScopes.test.ts
pnpm run validate
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add utils/spotifyAuth.ts functions/src/spotifyOAuth.ts tests/utils/spotifyAuthScopes.test.ts
git commit -m "feat(spotify): add library scopes (recently-played + playlists)

Adds user-read-recently-played, playlist-read-private, and
playlist-read-collaborative to both the frontend SPOTIFY_SCOPES and
the backend REQUIRED_SPOTIFY_SCOPES, kept in lockstep so partial-
consent enforcement stays honest. Required by the upcoming browse-
and-play front face.

Existing connected users (admin testers + Paul in dev) will hit
'insufficient scope' on the new Library endpoints and need to
reconnect once; later tasks add a dedicated banner for that case.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: `fetchUserPlaylists` utility

**Files:**

- Modify: `utils/spotifyAuth.ts` (add new exported function)
- Test: `tests/utils/spotifyLibrary.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/utils/spotifyLibrary.test.ts`:

```ts
/**
 * Coverage for the personal-Spotify Library API helpers. Mirrors the
 * defensive patterns in `searchSpotify` — Spotify's API has a documented
 * null-item quirk, and our utilities must tolerate it without throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUserPlaylists } from '@/utils/spotifyAuth';

describe('fetchUserPlaylists', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (body: unknown, ok = true, status = 200) =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);

  it('returns playlists with normalized shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          {
            id: 'pl1',
            name: 'Morning Mix',
            uri: 'spotify:playlist:pl1',
            owner: { display_name: 'Paul Ivers' },
            images: [{ url: 'https://img/pl1.jpg' }],
          },
        ],
      })
    );

    const out = await fetchUserPlaylists('tok');

    expect(out).toEqual([
      {
        id: 'pl1',
        name: 'Morning Mix',
        uri: 'spotify:playlist:pl1',
        owner: 'Paul Ivers',
        imageUrl: 'https://img/pl1.jpg',
      },
    ]);
  });

  it('tolerates null entries in items[]', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          null,
          {
            id: 'pl1',
            name: 'Morning Mix',
            uri: 'spotify:playlist:pl1',
            owner: { display_name: 'Paul' },
            images: [],
          },
          null,
        ],
      })
    );

    const out = await fetchUserPlaylists('tok');

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('pl1');
  });

  it('throws SpotifyScopeError on 403 with insufficient_scope', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond(
        { error: { status: 403, message: 'Insufficient client scope' } },
        false,
        403
      )
    );

    await expect(fetchUserPlaylists('tok')).rejects.toMatchObject({
      name: 'SpotifyScopeError',
    });
  });

  it('throws a generic error on 5xx', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({ error: { message: 'oops' } }, false, 500)
    );

    await expect(fetchUserPlaylists('tok')).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/spotifyLibrary.test.ts
```

Expected: FAIL — `fetchUserPlaylists` is not exported yet.

- [ ] **Step 3: Add the `SpotifyScopeError` class and `SpotifyPlaylist` type**

Near the top of `utils/spotifyAuth.ts` (after existing type exports, before the existing API functions), add:

```ts
/**
 * Thrown when the server returns 403 specifically because the token lacks a
 * scope. The browse face catches this distinctly to show a "Reconnect to
 * unlock playlists and recents" banner instead of a generic error.
 */
export class SpotifyScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyScopeError';
  }
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  owner: string;
  imageUrl?: string;
}
```

- [ ] **Step 4: Implement `fetchUserPlaylists`**

Add to `utils/spotifyAuth.ts` near the other API functions (e.g., after `searchSpotify`):

```ts
interface SpotifyPlaylistsApiResponse {
  items: Array<{
    id: string;
    name: string;
    uri: string;
    owner?: { display_name?: string };
    images?: Array<{ url: string }>;
  } | null>;
}

/**
 * GET /me/playlists for the connected user. Returns up to 50 playlists.
 * Tolerates Spotify's documented null-item quirk in items[].
 *
 * Throws SpotifyScopeError on 403/insufficient_scope so the browse face
 * can surface the dedicated reconnect banner; throws a generic Error on
 * any other non-2xx so the surrounding tab can render a retry affordance.
 */
export async function fetchUserPlaylists(
  accessToken: string,
  signal?: AbortSignal
): Promise<SpotifyPlaylist[]> {
  const url = new URL('https://api.spotify.com/v1/me/playlists');
  url.searchParams.set('limit', '50');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 403) {
      let body = '';
      try {
        body = (await res.text()).toLowerCase();
      } catch {
        // ignore — body read failed, fall through to generic 403
      }
      if (body.includes('scope')) {
        throw new SpotifyScopeError('Spotify playlists: insufficient scope');
      }
    }
    throw new Error(`Spotify playlists returned ${res.status}`);
  }
  const data = (await res.json()) as SpotifyPlaylistsApiResponse;
  const out: SpotifyPlaylist[] = [];
  for (const p of data.items ?? []) {
    if (!p) continue;
    out.push({
      id: p.id,
      name: p.name,
      uri: p.uri,
      owner: p.owner?.display_name ?? 'Spotify',
      imageUrl: p.images?.[0]?.url,
    });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify pass + validate**

```bash
pnpm vitest run tests/utils/spotifyLibrary.test.ts
pnpm run validate
```

Expected: all 4 tests pass; validate passes.

- [ ] **Step 6: Commit**

```bash
git add utils/spotifyAuth.ts tests/utils/spotifyLibrary.test.ts
git commit -m "feat(spotify): fetchUserPlaylists utility + scope-error type

GET /me/playlists with null-tolerance and a dedicated SpotifyScopeError
for 403/insufficient_scope so the browse face can distinguish 'reconnect
to grant new scopes' from a generic auth failure.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: `fetchRecentlyPlayed` utility

**Files:**

- Modify: `utils/spotifyAuth.ts` (add new exported function)
- Modify: `tests/utils/spotifyLibrary.test.ts` (extend)

- [ ] **Step 1: Add the failing test cases**

Append to `tests/utils/spotifyLibrary.test.ts`:

```ts
import { fetchRecentlyPlayed } from '@/utils/spotifyAuth';

describe('fetchRecentlyPlayed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (body: unknown, ok = true, status = 200) =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);

  it('flattens items[].track and normalizes shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          {
            track: {
              id: 't1',
              name: 'Banana Pancakes',
              uri: 'spotify:track:t1',
              artists: [{ name: 'Jack Johnson' }],
              album: { images: [{ url: 'https://img/t1.jpg' }] },
            },
          },
        ],
      })
    );

    const out = await fetchRecentlyPlayed('tok');

    expect(out).toEqual([
      {
        id: 't1',
        name: 'Banana Pancakes',
        uri: 'spotify:track:t1',
        artist: 'Jack Johnson',
        imageUrl: 'https://img/t1.jpg',
      },
    ]);
  });

  it('tolerates null items and null nested track', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          null,
          { track: null },
          {
            track: {
              id: 't1',
              name: 'Song',
              uri: 'spotify:track:t1',
              artists: [{ name: 'Artist' }],
              album: { images: [] },
            },
          },
        ],
      })
    );

    const out = await fetchRecentlyPlayed('tok');

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('t1');
  });

  it('throws SpotifyScopeError on 403/scope', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({ error: { message: 'Insufficient client scope' } }, false, 403)
    );

    await expect(fetchRecentlyPlayed('tok')).rejects.toMatchObject({
      name: 'SpotifyScopeError',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/spotifyLibrary.test.ts
```

Expected: FAIL — `fetchRecentlyPlayed` is not exported yet.

- [ ] **Step 3: Add the `SpotifyTrack` type**

In `utils/spotifyAuth.ts`, near `SpotifyPlaylist`:

```ts
export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artist: string;
  imageUrl?: string;
}
```

- [ ] **Step 4: Implement `fetchRecentlyPlayed`**

Add to `utils/spotifyAuth.ts`:

```ts
interface SpotifyRecentlyPlayedApiResponse {
  items: Array<{
    track: {
      id: string;
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    } | null;
  } | null>;
}

/**
 * GET /me/player/recently-played for the connected user. Returns up to 20
 * tracks. Tolerates null `items[]` entries and null `items[].track`
 * (Spotify omits the track when it has been removed from the catalog).
 *
 * Throws SpotifyScopeError on 403/insufficient_scope.
 */
export async function fetchRecentlyPlayed(
  accessToken: string,
  signal?: AbortSignal
): Promise<SpotifyTrack[]> {
  const url = new URL('https://api.spotify.com/v1/me/player/recently-played');
  url.searchParams.set('limit', '20');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) {
    if (res.status === 403) {
      let body = '';
      try {
        body = (await res.text()).toLowerCase();
      } catch {
        // ignore
      }
      if (body.includes('scope')) {
        throw new SpotifyScopeError(
          'Spotify recently-played: insufficient scope'
        );
      }
    }
    throw new Error(`Spotify recently-played returned ${res.status}`);
  }
  const data = (await res.json()) as SpotifyRecentlyPlayedApiResponse;
  const out: SpotifyTrack[] = [];
  for (const item of data.items ?? []) {
    if (!item) continue;
    const t = item.track;
    if (!t) continue;
    out.push({
      id: t.id,
      name: t.name,
      uri: t.uri,
      artist: t.artists.map((a) => a.name).join(', '),
      imageUrl: t.album?.images?.[0]?.url,
    });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify pass + validate**

```bash
pnpm vitest run tests/utils/spotifyLibrary.test.ts
pnpm run validate
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add utils/spotifyAuth.ts tests/utils/spotifyLibrary.test.ts
git commit -m "feat(spotify): fetchRecentlyPlayed utility

GET /me/player/recently-played with double-null tolerance (item null OR
item.track null — Spotify omits the latter for removed-catalog tracks).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: `useSpotifyLibrary` hook with module-level cache

**Files:**

- Create: `hooks/useSpotifyLibrary.ts`
- Test: `tests/hooks/useSpotifyLibrary.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/useSpotifyLibrary.test.tsx`:

```tsx
/**
 * useSpotifyLibrary cache + refresh behavior. The cache is module-level
 * (intentional — multiple Music widgets on one dashboard share one fetch),
 * so we reset it between tests via the exported __resetCacheForTests helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useSpotifyLibrary,
  __resetCacheForTests,
} from '@/hooks/useSpotifyLibrary';

const mockGetAccessToken = vi.fn();
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    getAccessToken: mockGetAccessToken,
    isConnected: true,
  }),
}));

const mockFetchPlaylists = vi.fn();
const mockFetchRecents = vi.fn();
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    fetchUserPlaylists: (...args: unknown[]) => mockFetchPlaylists(...args),
    fetchRecentlyPlayed: (...args: unknown[]) => mockFetchRecents(...args),
  };
});

describe('useSpotifyLibrary', () => {
  beforeEach(() => {
    __resetCacheForTests();
    mockGetAccessToken.mockResolvedValue('tok');
    mockFetchPlaylists.mockResolvedValue([
      { id: 'pl1', name: 'M', uri: 'u', owner: 'o' },
    ]);
    mockFetchRecents.mockResolvedValue([
      { id: 't1', name: 'T', uri: 'u', artist: 'a' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches playlists and recents in parallel on first mount', async () => {
    const { result } = renderHook(() => useSpotifyLibrary());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.playlists).toHaveLength(1);
    expect(result.current.recents).toHaveLength(1);
    expect(mockFetchPlaylists).toHaveBeenCalledTimes(1);
    expect(mockFetchRecents).toHaveBeenCalledTimes(1);
  });

  it('cache hit returns data immediately without re-fetching', async () => {
    const first = renderHook(() => useSpotifyLibrary());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    mockFetchPlaylists.mockClear();
    mockFetchRecents.mockClear();

    const second = renderHook(() => useSpotifyLibrary());

    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.playlists).toHaveLength(1);
    expect(mockFetchPlaylists).not.toHaveBeenCalled();
    expect(mockFetchRecents).not.toHaveBeenCalled();
  });

  it('refresh() invalidates the cache and refetches', async () => {
    const { result } = renderHook(() => useSpotifyLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetchPlaylists.mockClear();
    mockFetchRecents.mockClear();

    act(() => result.current.refresh());

    await waitFor(() => {
      expect(mockFetchPlaylists).toHaveBeenCalledTimes(1);
      expect(mockFetchRecents).toHaveBeenCalledTimes(1);
    });
  });

  it('captures SpotifyScopeError as error.kind === "scope"', async () => {
    const { SpotifyScopeError } = await import('@/utils/spotifyAuth');
    mockFetchPlaylists.mockRejectedValueOnce(
      new SpotifyScopeError('insufficient scope')
    );

    const { result } = renderHook(() => useSpotifyLibrary());

    await waitFor(() => {
      expect(result.current.error).toEqual({ kind: 'scope' });
    });
  });

  it('captures generic errors as error.kind === "generic"', async () => {
    mockFetchPlaylists.mockRejectedValueOnce(new Error('500'));

    const { result } = renderHook(() => useSpotifyLibrary());

    await waitFor(() => {
      expect(result.current.error).toEqual({ kind: 'generic', message: '500' });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/hooks/useSpotifyLibrary.test.tsx
```

Expected: FAIL — hook doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `hooks/useSpotifyLibrary.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import {
  fetchRecentlyPlayed,
  fetchUserPlaylists,
  SpotifyPlaylist,
  SpotifyScopeError,
  SpotifyTrack,
} from '@/utils/spotifyAuth';

const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  playlists: SpotifyPlaylist[];
  recents: SpotifyTrack[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((fn) => fn());
}

/** Test-only helper. Do not call in production code. */
export function __resetCacheForTests() {
  cache = null;
  inflight = null;
  subscribers.clear();
}

export type SpotifyLibraryError =
  | { kind: 'scope' }
  | { kind: 'generic'; message: string };

export interface UseSpotifyLibraryReturn {
  playlists: SpotifyPlaylist[];
  recents: SpotifyTrack[];
  isLoading: boolean;
  error: SpotifyLibraryError | null;
  refresh: () => void;
}

export function useSpotifyLibrary(): UseSpotifyLibraryReturn {
  const { getAccessToken, isConnected } = useSpotifyAuth();
  const [, forceTick] = useState(0);
  const [error, setError] = useState<SpotifyLibraryError | null>(null);

  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS ? cache : null;

  const load = useCallback(async () => {
    if (!isConnected) return;
    if (inflight) {
      await inflight;
      return;
    }
    setError(null);
    inflight = (async () => {
      const token = await getAccessToken();
      const [playlists, recents] = await Promise.all([
        fetchUserPlaylists(token),
        fetchRecentlyPlayed(token),
      ]);
      const entry: CacheEntry = {
        playlists,
        recents,
        fetchedAt: Date.now(),
      };
      cache = entry;
      return entry;
    })();
    try {
      await inflight;
    } catch (err) {
      if (err instanceof SpotifyScopeError) {
        setError({ kind: 'scope' });
      } else {
        setError({
          kind: 'generic',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    } finally {
      inflight = null;
      notifySubscribers();
    }
  }, [getAccessToken, isConnected]);

  useEffect(() => {
    const rerender = () => forceTick((n) => n + 1);
    subscribers.add(rerender);
    if (!fresh) {
      void load();
    }
    return () => {
      subscribers.delete(rerender);
    };
  }, [fresh, load]);

  const refresh = useCallback(() => {
    cache = null;
    void load();
  }, [load]);

  return {
    playlists: fresh?.playlists ?? [],
    recents: fresh?.recents ?? [],
    isLoading: !fresh && inflight !== null,
    error,
    refresh,
  };
}
```

- [ ] **Step 4: Run test to verify pass + validate**

```bash
pnpm vitest run tests/hooks/useSpotifyLibrary.test.tsx
pnpm run validate
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/useSpotifyLibrary.ts tests/hooks/useSpotifyLibrary.test.tsx
git commit -m "feat(spotify): useSpotifyLibrary hook with 10-min cache

Module-level cache singleton + subscriber-based notifications so
multiple Music widgets on one dashboard share one fetch. Captures
SpotifyScopeError as a distinct error kind so the browse face can
trigger the reconnect banner without confusing it with generic
network errors.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: `SpotifyResultRow` shared component

A single row used by Library, Search, and Recently Played sections.

**Files:**

- Create: `components/widgets/MusicWidget/SpotifyResultRow.tsx`
- Test: `tests/components/widgets/MusicWidget/SpotifyResultRow.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/SpotifyResultRow.test.tsx`:

```tsx
/**
 * SpotifyResultRow renders a track/playlist/album row across all three
 * tabs. Verifies the playing indicator and onClick wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpotifyResultRow } from '@/components/widgets/MusicWidget/SpotifyResultRow';

describe('SpotifyResultRow', () => {
  const baseProps = {
    name: 'Banana Pancakes',
    subtitle: 'Jack Johnson',
    imageUrl: 'https://img.test/x.jpg',
    isPlaying: false,
    onClick: vi.fn(),
  };

  it('renders name, subtitle, and image', () => {
    render(<SpotifyResultRow {...baseProps} />);
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getByText('Jack Johnson')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://img.test/x.jpg'
    );
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    render(<SpotifyResultRow {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the playing indicator when isPlaying is true', () => {
    render(<SpotifyResultRow {...baseProps} isPlaying />);
    expect(screen.getByLabelText('Currently playing')).toBeInTheDocument();
  });

  it('hides the playing indicator when isPlaying is false', () => {
    render(<SpotifyResultRow {...baseProps} isPlaying={false} />);
    expect(screen.queryByLabelText('Currently playing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/SpotifyResultRow.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/widgets/MusicWidget/SpotifyResultRow.tsx`:

```tsx
import React from 'react';
import { Play, Music2 } from 'lucide-react';

interface Props {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  isPlaying: boolean;
  onClick: () => void;
}

export const SpotifyResultRow: React.FC<Props> = ({
  name,
  subtitle,
  imageUrl,
  isPlaying,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left transition-colors"
    style={{
      gap: 'min(8px, 2cqmin)',
      padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
    }}
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        className="rounded-sm object-cover flex-shrink-0"
        style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
      />
    ) : (
      <div
        className="rounded-sm bg-slate-700 flex items-center justify-center flex-shrink-0"
        style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
      >
        <Music2
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div
        className="truncate text-white"
        style={{ fontSize: 'min(13px, 4.5cqmin)' }}
      >
        {name}
      </div>
      {subtitle && (
        <div
          className="truncate text-slate-400"
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          {subtitle}
        </div>
      )}
    </div>
    {isPlaying && (
      <Play
        aria-label="Currently playing"
        fill="currentColor"
        className="text-green-400 flex-shrink-0"
        style={{ width: 'min(14px, 3.5cqmin)', height: 'min(14px, 3.5cqmin)' }}
      />
    )}
  </button>
);
```

- [ ] **Step 4: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/SpotifyResultRow.test.tsx
pnpm run validate
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/widgets/MusicWidget/SpotifyResultRow.tsx tests/components/widgets/MusicWidget/SpotifyResultRow.test.tsx
git commit -m "feat(spotify): shared SpotifyResultRow component

Single row component for tracks/playlists/albums used across all three
browse-face tabs. Uses container-query units throughout to match the
widget's responsive scaling pattern.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: `PersonalSpotifyLibraryTab` component (Recently Played + Your Playlists)

**Files:**

- Create: `components/widgets/MusicWidget/PersonalSpotifyLibraryTab.tsx`
- Test: `tests/components/widgets/MusicWidget/PersonalSpotifyLibraryTab.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/PersonalSpotifyLibraryTab.test.tsx`:

```tsx
/**
 * Library tab renders Recently Played + Your Playlists sections, hides
 * empty sections cleanly, shows skeletons during load, and surfaces a
 * scope-rotation banner when the hook signals it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyLibraryTab } from '@/components/widgets/MusicWidget/PersonalSpotifyLibraryTab';
import type { UseSpotifyLibraryReturn } from '@/hooks/useSpotifyLibrary';

const mockHook = vi.fn<[], UseSpotifyLibraryReturn>();
vi.mock('@/hooks/useSpotifyLibrary', () => ({
  useSpotifyLibrary: () => mockHook(),
}));

const happy: UseSpotifyLibraryReturn = {
  playlists: [
    {
      id: 'pl1',
      name: 'Morning Mix',
      uri: 'spotify:playlist:pl1',
      owner: 'Paul',
    },
  ],
  recents: [
    {
      id: 't1',
      name: 'Banana Pancakes',
      uri: 'spotify:track:t1',
      artist: 'Jack Johnson',
    },
  ],
  isLoading: false,
  error: null,
  refresh: vi.fn(),
};

describe('PersonalSpotifyLibraryTab', () => {
  it('renders both sections when populated', () => {
    mockHook.mockReturnValue(happy);
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(screen.getByText(/Recently played/i)).toBeInTheDocument();
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getByText(/Your playlists/i)).toBeInTheDocument();
    expect(screen.getByText('Morning Mix')).toBeInTheDocument();
  });

  it('hides Recently Played section when recents are empty', () => {
    mockHook.mockReturnValue({ ...happy, recents: [] });
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(screen.queryByText(/Recently played/i)).toBeNull();
    expect(screen.getByText('Morning Mix')).toBeInTheDocument();
  });

  it('shows empty state when both lists are empty', () => {
    mockHook.mockReturnValue({ ...happy, playlists: [], recents: [] });
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(screen.getByText(/No playlists/i)).toBeInTheDocument();
  });

  it('shows skeleton rows during initial load', () => {
    mockHook.mockReturnValue({
      ...happy,
      playlists: [],
      recents: [],
      isLoading: true,
    });
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(
      screen.getAllByTestId('spotify-row-skeleton').length
    ).toBeGreaterThan(0);
  });

  it('shows the scope-rotation banner on scope errors', () => {
    mockHook.mockReturnValue({
      ...happy,
      playlists: [],
      recents: [],
      error: { kind: 'scope' },
    });
    const onReconnect = vi.fn();
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={onReconnect}
      />
    );
    expect(
      screen.getByText(/Spotify connection needs an update/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/i }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onPlay with the resource when a row is clicked', () => {
    mockHook.mockReturnValue(happy);
    const onPlay = vi.fn();
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={onPlay}
        onReconnect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Morning Mix'));
    expect(onPlay).toHaveBeenCalledWith({
      type: 'playlist',
      uri: 'spotify:playlist:pl1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyLibraryTab.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/widgets/MusicWidget/PersonalSpotifyLibraryTab.tsx`:

```tsx
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useSpotifyLibrary } from '@/hooks/useSpotifyLibrary';
import { SpotifyResultRow } from './SpotifyResultRow';

export interface SpotifyPlayablePick {
  type: 'track' | 'playlist' | 'album';
  uri: string;
}

interface Props {
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
}

const Skeleton: React.FC = () => (
  <div
    data-testid="spotify-row-skeleton"
    className="flex items-center gap-2 px-2 py-1.5 animate-pulse"
    style={{
      gap: 'min(8px, 2cqmin)',
      padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
    }}
  >
    <div
      className="rounded-sm bg-slate-700"
      style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
    />
    <div className="flex-1 space-y-1">
      <div className="h-3 bg-slate-700 rounded w-3/4" />
      <div className="h-2 bg-slate-800 rounded w-1/2" />
    </div>
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    className="text-slate-500 uppercase tracking-wider mt-3 mb-1 px-2"
    style={{
      fontSize: 'min(10px, 3cqmin)',
      letterSpacing: '0.05em',
      marginTop: 'min(12px, 3cqmin)',
      marginBottom: 'min(4px, 1cqmin)',
    }}
  >
    {children}
  </div>
);

export const PersonalSpotifyLibraryTab: React.FC<Props> = ({
  currentUri,
  onPlay,
  onReconnect,
}) => {
  const { playlists, recents, isLoading, error, refresh } = useSpotifyLibrary();

  if (error?.kind === 'scope') {
    return (
      <div
        className="m-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100"
        style={{
          padding: 'min(12px, 3cqmin)',
          fontSize: 'min(12px, 3.5cqmin)',
        }}
      >
        <div className="mb-2 font-semibold">
          Spotify connection needs an update
        </div>
        <div className="mb-3 text-amber-200/80">
          Your access has expanded. Reconnect to unlock playlists and recents.
        </div>
        <button
          type="button"
          onClick={onReconnect}
          className="px-3 py-1 rounded-md bg-amber-500 text-amber-950 font-semibold"
          style={{ fontSize: 'min(12px, 3.5cqmin)' }}
        >
          Reconnect
        </button>
      </div>
    );
  }

  if (isLoading && playlists.length === 0 && recents.length === 0) {
    return (
      <div className="flex flex-col">
        <SectionLabel>Recently played</SectionLabel>
        <Skeleton />
        <Skeleton />
        <SectionLabel>Your playlists</SectionLabel>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (playlists.length === 0 && recents.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center p-6 text-slate-400"
        style={{ padding: 'min(20px, 5cqmin)', fontSize: 'min(13px, 4cqmin)' }}
      >
        <div>No playlists in your Spotify account yet.</div>
        <div
          className="text-slate-500 mt-1"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Tap the Search tab to find something.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full">
      <div className="flex justify-end px-2 pt-1">
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh library"
          className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <RefreshCw
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
        </button>
      </div>
      {recents.length > 0 && (
        <>
          <SectionLabel>Recently played</SectionLabel>
          {recents.map((t) => (
            <SpotifyResultRow
              key={t.id}
              name={t.name}
              subtitle={t.artist}
              imageUrl={t.imageUrl}
              isPlaying={t.uri === currentUri}
              onClick={() => onPlay({ type: 'track', uri: t.uri })}
            />
          ))}
        </>
      )}
      {playlists.length > 0 && (
        <>
          <SectionLabel>Your playlists</SectionLabel>
          {playlists.map((p) => (
            <SpotifyResultRow
              key={p.id}
              name={p.name}
              subtitle={`Playlist · ${p.owner}`}
              imageUrl={p.imageUrl}
              isPlaying={p.uri === currentUri}
              onClick={() => onPlay({ type: 'playlist', uri: p.uri })}
            />
          ))}
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyLibraryTab.test.tsx
pnpm run validate
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifyLibraryTab.tsx tests/components/widgets/MusicWidget/PersonalSpotifyLibraryTab.test.tsx
git commit -m "feat(spotify): PersonalSpotifyLibraryTab with sections + skeleton

Library tab renders Recently Played + Your Playlists sections (each
hidden when empty), shows skeleton rows during the parallel fetch,
surfaces the dedicated scope-rotation banner on insufficient-scope
403s, and exposes the manual refresh icon in the tab header.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: `PersonalSpotifySearchTab` component

**Files:**

- Create: `components/widgets/MusicWidget/PersonalSpotifySearchTab.tsx`
- Test: `tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx`:

```tsx
/**
 * Search tab: debounced search, empty-query Recently Played fallback,
 * tap-to-play on results.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { PersonalSpotifySearchTab } from '@/components/widgets/MusicWidget/PersonalSpotifySearchTab';

const mockSearch = vi.fn();
const mockGetAccessToken = vi.fn();
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    searchSpotify: (...args: unknown[]) => mockSearch(...args),
  };
});
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));
vi.mock('@/hooks/useSpotifyLibrary', () => ({
  useSpotifyLibrary: () => ({
    playlists: [],
    recents: [
      { id: 't1', name: 'Fallback Song', uri: 'spotify:track:t1', artist: 'X' },
    ],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe('PersonalSpotifySearchTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAccessToken.mockResolvedValue('tok');
    mockSearch.mockResolvedValue([
      {
        type: 'track',
        id: 'r1',
        name: 'Jack Johnson Result',
        uri: 'spotify:track:r1',
        subtitle: 'Jack Johnson',
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows Recently Played fallback when input is empty', () => {
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={vi.fn()} />);
    expect(screen.getByText(/Type to search Spotify/i)).toBeInTheDocument();
    expect(screen.getByText('Fallback Song')).toBeInTheDocument();
  });

  it('debounces search by 300ms', async () => {
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Search Spotify/i);

    fireEvent.change(input, { target: { value: 'jack' } });
    expect(mockSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(mockSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2);
    });
    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith('tok', 'jack', expect.anything());
    });
  });

  it('renders search results after debounce fires', async () => {
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search Spotify/i), {
      target: { value: 'jack' },
    });
    act(() => {
      vi.advanceTimersByTime(301);
    });
    await waitFor(() => {
      expect(screen.getByText('Jack Johnson Result')).toBeInTheDocument();
    });
  });

  it('calls onPlay with the resource when a result is clicked', async () => {
    const onPlay = vi.fn();
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={onPlay} />);
    fireEvent.change(screen.getByPlaceholderText(/Search Spotify/i), {
      target: { value: 'jack' },
    });
    act(() => {
      vi.advanceTimersByTime(301);
    });
    await waitFor(() => screen.getByText('Jack Johnson Result'));

    fireEvent.click(screen.getByText('Jack Johnson Result'));

    expect(onPlay).toHaveBeenCalledWith({
      type: 'track',
      uri: 'spotify:track:r1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/widgets/MusicWidget/PersonalSpotifySearchTab.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchSpotify, SpotifySearchResult } from '@/utils/spotifyAuth';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyLibrary } from '@/hooks/useSpotifyLibrary';
import { SpotifyResultRow } from './SpotifyResultRow';
import type { SpotifyPlayablePick } from './PersonalSpotifyLibraryTab';

interface Props {
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
}

const DEBOUNCE_MS = 300;

export const PersonalSpotifySearchTab: React.FC<Props> = ({
  currentUri,
  onPlay,
}) => {
  const { getAccessToken } = useSpotifyAuth();
  const { recents } = useSpotifyLibrary();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          setSearchError('Spotify session expired — reconnect.');
          setResults([]);
          return;
        }
        const out = await searchSpotify(token, trimmed, controller.signal);
        setResults(out);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, getAccessToken]);

  const handlePlay = (r: SpotifySearchResult) => {
    onPlay({ type: r.type, uri: r.uri });
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="relative px-2 pt-2"
        style={{ padding: 'min(8px, 2cqmin) min(8px, 2cqmin) 0' }}
      >
        <Search
          className="absolute text-slate-500 pointer-events-none"
          style={{
            left: 'min(16px, 4cqmin)',
            top: '50%',
            transform: 'translateY(-25%)',
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spotify…"
          className="w-full bg-slate-800 border border-slate-700 rounded-md text-white placeholder:text-slate-500"
          style={{
            paddingLeft: 'min(28px, 7cqmin)',
            paddingRight: 'min(8px, 2cqmin)',
            paddingTop: 'min(6px, 1.5cqmin)',
            paddingBottom: 'min(6px, 1.5cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto mt-2">
        {searchError && (
          <div
            className="px-3 py-2 text-red-400"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            {searchError}
          </div>
        )}
        {!query.trim() && (
          <>
            <div
              className="px-3 py-3 text-slate-400 text-center"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
            >
              Type to search Spotify
            </div>
            {recents.length > 0 && (
              <>
                <div
                  className="text-slate-500 uppercase tracking-wider px-2 mb-1"
                  style={{
                    fontSize: 'min(10px, 3cqmin)',
                    letterSpacing: '0.05em',
                  }}
                >
                  Recently played
                </div>
                {recents.map((t) => (
                  <SpotifyResultRow
                    key={t.id}
                    name={t.name}
                    subtitle={t.artist}
                    imageUrl={t.imageUrl}
                    isPlaying={t.uri === currentUri}
                    onClick={() => onPlay({ type: 'track', uri: t.uri })}
                  />
                ))}
              </>
            )}
          </>
        )}
        {!isSearching &&
          query.trim() &&
          !searchError &&
          results.map((r) => (
            <SpotifyResultRow
              key={r.id}
              name={r.name}
              subtitle={r.subtitle}
              imageUrl={r.imageUrl}
              isPlaying={r.uri === currentUri}
              onClick={() => handlePlay(r)}
            />
          ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx
pnpm run validate
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifySearchTab.tsx tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx
git commit -m "feat(spotify): PersonalSpotifySearchTab with debounced search

300ms-debounced search via the existing searchSpotify utility, with
empty-query fallback that surfaces Recently Played as 'while you decide'
content. Inherits search-result null tolerance from the prior
spotifyAuthSearch fix.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: `PersonalSpotifyNowPlayingTab` (extract SDK player + iframe fallback)

This task **copies** the player-and-iframe rendering out of the existing `PersonalSpotifyPlayer.tsx` into a new tab component. The original code stays in `PersonalSpotifyPlayer.tsx` until Task 11 strips it. So after this task, both components compile and render identically — the codebase temporarily duplicates the SDK setup. Task 11 cleans up the duplication.

**Files:**

- Create: `components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.tsx`
- Test: `tests/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.test.tsx` (new)
- Read for reference: `components/widgets/MusicWidget/PersonalSpotifyPlayer.tsx` (existing player + iframe code)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.test.tsx`:

```tsx
/**
 * Now Playing tab: only the empty-state path is covered here. The SDK
 * player surface is extracted from PersonalSpotifyPlayer (covered by
 * existing player tests via the dispatcher in Task 11) and the iframe
 * is a single <iframe src={url}> with no testable logic — both are on
 * the manual-verification checklist (Task 13).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalSpotifyNowPlayingTab } from '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab';

vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    isPremium: true,
    getAccessToken: vi.fn().mockResolvedValue('tok'),
  }),
}));

describe('PersonalSpotifyNowPlayingTab', () => {
  it('shows empty state when no URI is set', () => {
    render(
      <PersonalSpotifyNowPlayingTab url={null} onSwitchToLibrary={vi.fn()} />
    );
    expect(
      screen.getByText(/Pick something from your library or search/i)
    ).toBeInTheDocument();
  });

  it('renders the Open library button in the empty state', () => {
    const onSwitch = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab url={null} onSwitchToLibrary={onSwitch} />
    );
    expect(
      screen.getByRole('button', { name: /Open library/i })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Read the existing player code for reference**

Open `components/widgets/MusicWidget/PersonalSpotifyPlayer.tsx` and identify three regions:

1. Empty/disconnected/loading guards (top of component)
2. SDK player setup + render (album art + name + controls)
3. iframe-embed fallback (Free user path)

Sections 2 and 3 move into the new tab; section 1 stays in `PersonalSpotifyPlayer` (next task).

- [ ] **Step 4: Implement the tab**

Create `components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.tsx` by:

1. Copying the SDK player setup + render from `PersonalSpotifyPlayer.tsx` (the `useEffect` that loads the SDK, the play/pause/skip controls, and the album-art JSX).
2. Copying the iframe-embed fallback JSX.
3. Adding a new empty state when `url` is null.

The component signature:

```tsx
import React from 'react';
// ... move imports as needed from PersonalSpotifyPlayer

interface Props {
  url: string | null;
  onSwitchToLibrary: () => void;
}

export const PersonalSpotifyNowPlayingTab: React.FC<Props> = ({
  url,
  onSwitchToLibrary,
}) => {
  // 1. If url is null: empty state CTA
  if (!url) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center h-full p-6 text-slate-400"
        style={{ padding: 'min(20px, 5cqmin)', fontSize: 'min(13px, 4cqmin)' }}
      >
        <div className="mb-2">
          Pick something from your library or search to start.
        </div>
        <button
          type="button"
          onClick={onSwitchToLibrary}
          className="text-green-400 hover:text-green-300 underline-offset-2 hover:underline"
          style={{ fontSize: 'min(12px, 3.5cqmin)' }}
        >
          Open library
        </button>
      </div>
    );
  }
  // 2. Premium + SDK ready: render the existing player UI (paste from PersonalSpotifyPlayer)
  // 3. Else: render Spotify iframe at the embed URL (paste from PersonalSpotifyPlayer)
  // ...
};
```

Reference the existing `PersonalSpotifyPlayer.tsx` for the exact SDK setup, embed URL building, and JSX. Keep the player surface identical — this is a move, not a redesign.

- [ ] **Step 5: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.test.tsx
pnpm run validate
```

Expected: empty-state test passes; full extraction compiles cleanly.

- [ ] **Step 6: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.tsx tests/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.test.tsx
git commit -m "refactor(spotify): extract Now Playing tab from PersonalSpotifyPlayer

Move the SDK-player setup + album-art controls + iframe-embed fallback
into a dedicated tab component. PersonalSpotifyPlayer keeps the
dispatch logic but loses the renderer body. No behavioral change —
the player surface is identical.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: `PersonalSpotifyTabs` tab-strip component

**Files:**

- Create: `components/widgets/MusicWidget/PersonalSpotifyTabs.tsx`
- Test: `tests/components/widgets/MusicWidget/PersonalSpotifyTabs.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/PersonalSpotifyTabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyTabs } from '@/components/widgets/MusicWidget/PersonalSpotifyTabs';

describe('PersonalSpotifyTabs', () => {
  it('renders three tabs with the active one highlighted', () => {
    render(
      <PersonalSpotifyTabs
        active="library"
        isAudioActive={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Playlists/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Search/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('shows the green dot on Now Playing when audio is active', () => {
    render(
      <PersonalSpotifyTabs active="library" isAudioActive onChange={vi.fn()} />
    );
    expect(screen.getByLabelText(/audio playing/i)).toBeInTheDocument();
  });

  it('hides the green dot when no audio', () => {
    render(
      <PersonalSpotifyTabs
        active="library"
        isAudioActive={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/audio playing/i)).toBeNull();
  });

  it('calls onChange with the new tab key', () => {
    const onChange = vi.fn();
    render(
      <PersonalSpotifyTabs
        active="library"
        isAudioActive={false}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));
    expect(onChange).toHaveBeenCalledWith('search');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyTabs.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/widgets/MusicWidget/PersonalSpotifyTabs.tsx`:

```tsx
import React from 'react';

export type SpotifyBrowserTab = 'library' | 'search' | 'now-playing';

interface Props {
  active: SpotifyBrowserTab;
  isAudioActive: boolean;
  onChange: (next: SpotifyBrowserTab) => void;
}

const TAB_LABELS: Record<SpotifyBrowserTab, string> = {
  library: 'Playlists',
  search: 'Search',
  'now-playing': 'Now playing',
};

export const PersonalSpotifyTabs: React.FC<Props> = ({
  active,
  isAudioActive,
  onChange,
}) => {
  const tabs: SpotifyBrowserTab[] = ['library', 'search', 'now-playing'];
  return (
    <div
      className="flex gap-1 px-2 pb-1"
      style={{
        gap: 'min(4px, 1cqmin)',
        padding: '0 min(8px, 2cqmin) min(4px, 1cqmin)',
      }}
    >
      {tabs.map((key) => {
        const isOn = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isOn}
            className={`rounded-full transition-colors ${
              isOn
                ? 'bg-green-500 text-slate-950 font-semibold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            style={{
              padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            <span>{TAB_LABELS[key]}</span>
            {key === 'now-playing' && isAudioActive && (
              <span
                aria-label="audio playing"
                className="inline-block ml-1 bg-green-400 rounded-full"
                style={{
                  width: 'min(5px, 1.2cqmin)',
                  height: 'min(5px, 1.2cqmin)',
                  verticalAlign: 'middle',
                  boxShadow: '0 0 4px rgba(74, 222, 128, 0.7)',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyTabs.test.tsx
pnpm run validate
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifyTabs.tsx tests/components/widgets/MusicWidget/PersonalSpotifyTabs.test.tsx
git commit -m "feat(spotify): PersonalSpotifyTabs tab-strip + green-dot indicator

Three-tab strip (Playlists · Search · Now playing) with the active tab
highlighted in Spotify-green and a small pulsing dot on 'Now playing'
when audio is active. aria-pressed on each tab for accessibility.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: `PersonalSpotifyBrowser` top-level component

**Files:**

- Create: `components/widgets/MusicWidget/PersonalSpotifyBrowser.tsx`
- Test: `tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx`:

```tsx
/**
 * Browser owns tab state, isAudioActive derivation, and the tap-to-play
 * handler. Each tab is mocked so this test focuses on integration.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyBrowser } from '@/components/widgets/MusicWidget/PersonalSpotifyBrowser';

const mockUpdateWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget: mockUpdateWidget }),
}));
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    isPremium: true,
    getAccessToken: vi.fn().mockResolvedValue('tok'),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  }),
}));

const playMock = vi.fn();
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    playOnDevice: (...args: unknown[]) => playMock(...args),
  };
});

vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyLibraryTab', () => ({
  PersonalSpotifyLibraryTab: ({
    onPlay,
  }: {
    onPlay: (p: { type: 'track' | 'playlist' | 'album'; uri: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onPlay({ type: 'track', uri: 'spotify:track:t1' })}
    >
      mock-play-track
    </button>
  ),
}));
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifySearchTab', () => ({
  PersonalSpotifySearchTab: () => <div>mock-search</div>,
}));
vi.mock(
  '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab',
  () => ({
    PersonalSpotifyNowPlayingTab: ({ url }: { url: string | null }) => (
      <div>mock-now-playing url={String(url)}</div>
    ),
  })
);

const widget = {
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '' },
};

describe('PersonalSpotifyBrowser', () => {
  it('defaults to Library tab on mount', () => {
    render(<PersonalSpotifyBrowser widget={widget as never} />);
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('tap on a track persists URL and stays on current tab', () => {
    render(<PersonalSpotifyBrowser widget={widget as never} />);
    fireEvent.click(screen.getByText('mock-play-track'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
    // Library tab still shown (no auto-switch):
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('clicking the Now Playing tab switches the rendered tab', () => {
    render(<PersonalSpotifyBrowser widget={widget as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Now playing/i }));
    expect(screen.getByText(/mock-now-playing/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/widgets/MusicWidget/PersonalSpotifyBrowser.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { WidgetData, MusicConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { playOnDevice } from '@/utils/spotifyAuth';
import { PersonalSpotifyTabs, SpotifyBrowserTab } from './PersonalSpotifyTabs';
import {
  PersonalSpotifyLibraryTab,
  SpotifyPlayablePick,
} from './PersonalSpotifyLibraryTab';
import { PersonalSpotifySearchTab } from './PersonalSpotifySearchTab';
import { PersonalSpotifyNowPlayingTab } from './PersonalSpotifyNowPlayingTab';

interface Props {
  widget: WidgetData;
}

interface SdkState {
  deviceId: string | null;
  isPlaying: boolean;
}

export const PersonalSpotifyBrowser: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const { updateWidget } = useDashboard();
  const { isPremium, getAccessToken, disconnect, reconnect } = useSpotifyAuth();

  const [activeTab, setActiveTab] = useState<SpotifyBrowserTab>('library');
  const [sdk, setSdk] = useState<SdkState>({
    deviceId: null,
    isPlaying: false,
  });

  const currentUri = config.personalSpotifyUrl ?? null;
  const isAudioActive = sdk.isPlaying || (!isPremium && Boolean(currentUri));

  const handleReconnect = useCallback(async () => {
    await disconnect();
    await reconnect();
  }, [disconnect, reconnect]);

  const handlePlay = useCallback(
    async (pick: SpotifyPlayablePick) => {
      updateWidget(widget.id, {
        config: { personalSpotifyUrl: pick.uri },
      });
      if (!isPremium) return;
      const token = await getAccessToken();
      if (!token || !sdk.deviceId) return;
      const payload =
        pick.type === 'track' ? { uris: [pick.uri] } : { contextUri: pick.uri };
      try {
        await playOnDevice(token, sdk.deviceId, payload);
      } catch (err) {
        console.warn('[PersonalSpotifyBrowser.handlePlay] play failed', err);
      }
    },
    [updateWidget, widget.id, isPremium, getAccessToken, sdk.deviceId]
  );

  // SDK state (device-id + isPlaying) is reported back by
  // PersonalSpotifyNowPlayingTab via the `onSdkState` callback wired up
  // in Task 11. Until then, sdk stays at its initial null/false values
  // and the green-dot indicator simply doesn't appear in Premium mode.

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex flex-col h-full bg-slate-900/60 backdrop-blur-sm">
          <PersonalSpotifyTabs
            active={activeTab}
            isAudioActive={isAudioActive}
            onChange={setActiveTab}
          />
          {activeTab === 'library' && (
            <PersonalSpotifyLibraryTab
              currentUri={currentUri}
              onPlay={handlePlay}
              onReconnect={handleReconnect}
            />
          )}
          {activeTab === 'search' && (
            <PersonalSpotifySearchTab
              currentUri={currentUri}
              onPlay={handlePlay}
            />
          )}
          {activeTab === 'now-playing' && (
            <PersonalSpotifyNowPlayingTab
              url={currentUri}
              onSwitchToLibrary={() => setActiveTab('library')}
            />
          )}
        </div>
      }
    />
  );
};
```

- [ ] **Step 4: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx
pnpm run validate
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifyBrowser.tsx tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx
git commit -m "feat(spotify): PersonalSpotifyBrowser top-level

Owns tab state, isAudioActive derivation, and the tap-to-play handler.
Default tab is Library; no auto-switch to Now Playing on tap.
Track URIs go to playOnDevice as 'uris', playlists/albums as 'contextUri'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: Wire `PersonalSpotifyPlayer` to dispatch into the Browser

The dispatcher chooses between "not connected" CTA and the new Browser. SDK device-id + isPlaying state lifts up from the Now Playing tab via callbacks so the Browser can show the green dot indicator.

**Files:**

- Modify: `components/widgets/MusicWidget/PersonalSpotifyPlayer.tsx` (strip down to dispatcher)
- Modify: `components/widgets/MusicWidget/PersonalSpotifyBrowser.tsx` (accept SDK state callbacks)
- Modify: `components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.tsx` (call back with SDK state)
- Test: `tests/components/widgets/MusicWidget/PersonalSpotifyPlayer.dispatch.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/MusicWidget/PersonalSpotifyPlayer.dispatch.test.tsx`:

```tsx
/**
 * After the refactor, PersonalSpotifyPlayer is pure dispatch — either the
 * CTA or the Browser. Tests cover both branches.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalSpotifyPlayer } from '@/components/widgets/MusicWidget/PersonalSpotifyPlayer';

vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyBrowser', () => ({
  PersonalSpotifyBrowser: () => <div>mock-browser</div>,
}));

const mockUseSpotifyAuth = vi.fn();
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => mockUseSpotifyAuth(),
}));

const widget = {
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '' },
};

describe('PersonalSpotifyPlayer dispatch', () => {
  it('renders the Connect CTA when not connected', () => {
    mockUseSpotifyAuth.mockReturnValue({
      isConnected: false,
      state: { status: 'idle' },
    });
    render(<PersonalSpotifyPlayer widget={widget as never} />);
    expect(screen.getByText(/Connect Spotify/i)).toBeInTheDocument();
  });

  it('renders the Browser when connected', () => {
    mockUseSpotifyAuth.mockReturnValue({
      isConnected: true,
      state: { status: 'connected' },
    });
    render(<PersonalSpotifyPlayer widget={widget as never} />);
    expect(screen.getByText('mock-browser')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyPlayer.dispatch.test.tsx
```

Expected: FAIL — existing player renders other content.

- [ ] **Step 3: Strip `PersonalSpotifyPlayer.tsx` down to a dispatcher**

Replace the entire body of `components/widgets/MusicWidget/PersonalSpotifyPlayer.tsx` with:

```tsx
/**
 * Dispatch for personal-Spotify mode on the Music widget front face.
 *  - Not connected → Connect CTA (existing flow).
 *  - Connected → <PersonalSpotifyBrowser /> (the new 3-tab UI).
 * Player rendering (SDK + iframe) lives inside PersonalSpotifyNowPlayingTab.
 */
import React from 'react';
import { Music2 } from 'lucide-react';
import { WidgetData } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { PersonalSpotifyBrowser } from './PersonalSpotifyBrowser';

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyPlayer: React.FC<Props> = ({ widget }) => {
  const { isConnected, state } = useSpotifyAuth();

  if (state.status === 'unknown') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music2}
            title="Loading Spotify…"
            subtitle="Checking your connection."
          />
        }
      />
    );
  }

  if (!isConnected) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music2}
            title="Connect Spotify"
            subtitle="Flip the widget to connect your account."
          />
        }
      />
    );
  }

  return <PersonalSpotifyBrowser widget={widget} />;
};
```

- [ ] **Step 4: Add SDK state-callback to `PersonalSpotifyBrowser` and forward to the Now Playing tab**

The Now Playing tab owns the SDK loader. When it gets a device-id or player state, it calls back into the Browser so the Browser can render the green dot.

Edit `PersonalSpotifyBrowser.tsx` to accept and pass through:

```tsx
// In PersonalSpotifyBrowser.tsx
const handleSdkState = useCallback(
  (next: { deviceId: string | null; isPlaying: boolean }) => {
    setSdk(next);
  },
  []
);

// ... inside JSX:
{
  activeTab === 'now-playing' && (
    <PersonalSpotifyNowPlayingTab
      url={currentUri}
      onSwitchToLibrary={() => setActiveTab('library')}
      onSdkState={handleSdkState}
    />
  );
}
```

Edit `PersonalSpotifyNowPlayingTab.tsx` to accept and call `onSdkState` whenever the SDK player's `ready` or `player_state_changed` events fire. (The exact event hooks come from `utils/spotifyPlaybackSdk.ts` — refer to the existing usage in the pre-refactor `PersonalSpotifyPlayer.tsx`.)

- [ ] **Step 5: Run test to verify pass + validate**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/PersonalSpotifyPlayer.dispatch.test.tsx tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx
pnpm run validate
```

Expected: dispatch tests pass; previous Browser tests still pass; full suite passes.

- [ ] **Step 6: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifyPlayer.tsx components/widgets/MusicWidget/PersonalSpotifyBrowser.tsx components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.tsx tests/components/widgets/MusicWidget/PersonalSpotifyPlayer.dispatch.test.tsx
git commit -m "refactor(spotify): wire PersonalSpotifyPlayer as dispatcher into Browser

Player loses all rendering responsibility — it picks between the Connect
CTA and the new <PersonalSpotifyBrowser>. SDK state lifts from the Now
Playing tab to the Browser via onSdkState callback so the tab strip can
show the green-dot 'audio playing' indicator regardless of which tab is
currently visible.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: Simplify `PersonalSpotifyPanel` (settings)

Remove the URL/search field from settings since the front-face Search tab handles it.

**Files:**

- Modify: `components/widgets/MusicWidget/PersonalSpotifyPanel.tsx`
- Modify: `tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx` (existing — may need adjustment if it asserts on the removed input)

- [ ] **Step 1: Locate and remove the URL/search field**

Open `components/widgets/MusicWidget/PersonalSpotifyPanel.tsx`. Find the JSX region that renders the "Spotify URL or search" label, input, and result dropdown. Remove that entire region. Also remove any state, effects, and helpers used only by that field (search results state, debounce effect, result handler).

Keep:

- Connect/disconnect button + premium status badge
- Source toggle (curated · personal)

- [ ] **Step 2: Update the test if it asserts on the removed input**

```bash
pnpm vitest run tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx
```

If a test fails on "Spotify URL or search" or similar, edit the test to remove that assertion. The gate behavior (admin-only access) should not change.

- [ ] **Step 3: Run validate**

```bash
pnpm run validate
```

Expected: full suite passes; no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add components/widgets/MusicWidget/PersonalSpotifyPanel.tsx tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx
git commit -m "refactor(spotify): drop URL/search field from settings panel

The search affordance now lives on the front-face Search tab. Settings
panel becomes purely config: connect/disconnect + source toggle.
personalSpotifyUrl is still persisted, just written-to by row taps on
the front face.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: Push to dev-paul and run manual verification

After Task 12 commits, the working dev-paul branch has the full feature.

**Files:** (none — verification only)

- [ ] **Step 1: Push everything to origin/dev-paul**

```bash
git push origin dev-paul
```

CI runs `firebase-dev-deploy.yml`. Watch the run:

```bash
gh run list --branch dev-paul --limit 3
```

Wait for the latest run to complete successfully (~5–7 min).

- [ ] **Step 2: Reconnect Spotify on dev preview**

Open the dev preview URL. The currently-connected Spotify session lacks the new scopes. The Library tab should surface the **"Spotify connection needs an update — Reconnect"** banner.

Tap Reconnect → re-grant on the Spotify consent screen → banner clears, Library tab populates.

- [ ] **Step 3: Run through the manual verification checklist**

From the spec:

- [ ] Premium + connected: tap a playlist row in Library → SDK player plays in Now Playing tab
- [ ] Premium + connected: tap a track row in Library → same
- [ ] Search: type "jack johnson radio" → results render, null-playlist guard still prevents the prior crash
- [ ] Now Playing tab green-dot indicator appears whenever audio is active, regardless of which tab is open
- [ ] Reload page mid-playback → Now Playing tab restores at the last track (paused)
- [ ] Refresh icon: tap → spinner → fresh data
- [ ] (If accessible) Test on a Free Spotify account: tap row → Now Playing tab shows iframe
- [ ] Settings panel: only connect button + source toggle remain (URL/search field is gone)

If any check fails, write a regression test and fix before declaring complete.

- [ ] **Step 4: No commit for this task** — verification only.

---

## Summary of files changed

```
NEW:
  components/widgets/MusicWidget/PersonalSpotifyBrowser.tsx
  components/widgets/MusicWidget/PersonalSpotifyTabs.tsx
  components/widgets/MusicWidget/PersonalSpotifyLibraryTab.tsx
  components/widgets/MusicWidget/PersonalSpotifySearchTab.tsx
  components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.tsx
  components/widgets/MusicWidget/SpotifyResultRow.tsx
  hooks/useSpotifyLibrary.ts
  tests/utils/spotifyAuthScopes.test.ts
  tests/utils/spotifyLibrary.test.ts
  tests/hooks/useSpotifyLibrary.test.tsx
  tests/components/widgets/MusicWidget/SpotifyResultRow.test.tsx
  tests/components/widgets/MusicWidget/PersonalSpotifyLibraryTab.test.tsx
  tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx
  tests/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab.test.tsx
  tests/components/widgets/MusicWidget/PersonalSpotifyTabs.test.tsx
  tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx
  tests/components/widgets/MusicWidget/PersonalSpotifyPlayer.dispatch.test.tsx

MODIFIED:
  utils/spotifyAuth.ts                              (add scopes, types, 2 utility fns)
  functions/src/spotifyOAuth.ts                     (add scopes)
  components/widgets/MusicWidget/PersonalSpotifyPlayer.tsx  (strip to dispatcher)
  components/widgets/MusicWidget/PersonalSpotifyPanel.tsx   (remove URL/search field)
  tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx  (drop removed-input assertion)
```
