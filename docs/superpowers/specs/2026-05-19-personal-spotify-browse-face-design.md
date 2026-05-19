# Personal Spotify — browse-and-play front face

**Status:** Design — pending implementation plan
**Author:** Paul Ivers (with Claude)
**Date:** 2026-05-19
**Related:** PR [#1662](https://github.com/OPS-PIvers/SpartBoard/pull/1662) (per-teacher Spotify auth + Web Playback SDK), PR [#1665](https://github.com/OPS-PIvers/SpartBoard/pull/1665) (personal-spotify global feature gate)

## Problem

After a teacher connects their personal Spotify account in the Music widget settings, the widget front face is empty until they paste a URL or use the back-face search dropdown. There is no way to browse their own playlists or recent tracks from the front face. The unintuitive empty state was reported as the primary complaint after rolling out the personal-spotify flow.

## Goal

Replace the empty front face with a tabbed browse-and-play UI that surfaces the teacher's recently played tracks, their own playlists, and a search interface — all without leaving the widget face. Make the act of starting music a single tap from the dashboard.

## Non-goals

- Curated-mode (shared Spotify/YouTube library) behavior is unchanged.
- No queue management or "play next" — single tap interrupts current playback. Matches Spotify mobile's default behavior.
- No Liked Songs surface in this iteration. (`/me/tracks` is a separate endpoint and a separate UX problem.)
- No Spotify-side recommendations or Discover Weekly carousels beyond what naturally appears in the user's playlists.

## Behavior model

Three tabs, defaulting to **Playlists**. Tabs render lazily — the Search tab's debounced fetch and the Now Playing tab's SDK player only mount once that tab is opened — so the cost of opening a never-used tab is zero:

```
┌────────────────────────────────────────┐
│ Paul Ivers · Premium             ⟲     │  ← header (status + manual refresh)
├────────────────────────────────────────┤
│ [Playlists]  Search  Now playing       │  ← tab strip; green dot on Now playing
│                                        │     when audio is active
│ Recently played                        │
│ ▶ Banana Pancakes — Jack Johnson       │  ← currently-playing row shows ▶
│   Discover Weekly                      │
│   Lofi Beats                           │
│                                        │
│ Your playlists                         │
│   Morning Mix                          │
│   Friday Vibes                         │
│   …                                    │
└────────────────────────────────────────┘
```

- **Playlists tab** (default): two sections, "Recently played" (top, last 20 from `/me/player/recently-played`) and "Your playlists" (`/me/playlists?limit=50`).
- **Search tab**: focused input on open, 300ms-debounced calls to `searchSpotify`. Empty input shows "Type to search Spotify" plus a duplicate of Recently Played as a fallback.
- **Now Playing tab**: big album art + track + artist + play/pause/skip for Premium users (the existing SDK player extracted). For Free users, renders the Spotify iframe embed at the current `personalSpotifyUrl`.

**Tap-to-play.** Single tap on any row in Playlists or Search starts playback immediately via `playOnDevice` (Premium) or by writing the URL to `personalSpotifyUrl` and letting the iframe render it (Free). The current tab does **not** auto-switch — the Now Playing tab gets a green dot indicator so the teacher knows audio is going, but they stay where they are so they can queue the next pick.

**Currently-playing indicator.** The played row shows a small green ▶ icon for easy re-find. `personalSpotifyUrl` persists in widget config so a page reload restores the Now Playing tab to a paused state at the last track.

**Active tab is not persisted.** Every widget open returns to Playlists. No per-widget tab memory.

## Architecture

### File structure

```
components/widgets/MusicWidget/
├── PersonalSpotifyPlayer.tsx       (existing) — dispatch: Browser vs iframe fallback
├── PersonalSpotifyBrowser.tsx      NEW — top-level for connected users
├── PersonalSpotifyTabs.tsx         NEW — tab strip + green-dot indicator
├── PersonalSpotifyLibraryTab.tsx   NEW — Recently played + Your playlists sections
├── PersonalSpotifySearchTab.tsx    NEW — search input + debounced results
├── PersonalSpotifyNowPlayingTab.tsx NEW — big-art player (extracted from existing)
├── SpotifyResultRow.tsx            NEW — shared row (thumb + name + sub + playing indicator)
└── PersonalSpotifyPanel.tsx        (existing) — settings panel, simplified
```

`PersonalSpotifyPlayer.tsx` remains the dispatcher:

- **Not connected** → existing "Connect Spotify" CTA (unchanged)
- **Connected (any tier)** → `<PersonalSpotifyBrowser>`. Inside the Browser:
  - Premium → SDK player in the Now Playing tab; row taps call `playOnDevice`.
  - Free → Spotify iframe embed in the Now Playing tab; row taps just save the URL to config and the iframe re-renders.
  - Scope-rotation 403 detected on a Library API call → reconnect banner inside the Library tab (other tabs still work).

### New Spotify API utilities (in `utils/spotifyAuth.ts`)

| Function                             | Endpoint                                     | Notes                                                                               |
| ------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `fetchUserPlaylists(token, signal)`  | `GET /v1/me/playlists?limit=50`              | Returns `Playlist[]`. Tolerates null items per the same pattern as `searchSpotify`. |
| `fetchRecentlyPlayed(token, signal)` | `GET /v1/me/player/recently-played?limit=20` | Returns `Track[]` flattened from `items[].track`. Tolerates null items.             |

Both follow the existing pattern (Bearer token header, 10s timeout, throw on non-2xx with response body context).

### New hook: `hooks/useSpotifyLibrary.ts`

```ts
interface UseSpotifyLibraryReturn {
  playlists: Playlist[];
  recents: Track[];
  isLoading: boolean;
  error: SpotifyLibraryError | null;
  refresh: () => void;
}
```

Module-level cache singleton, 10-minute TTL:

```ts
let cache: {
  playlists: Playlist[];
  recents: Track[];
  fetchedAt: number;
} | null = null;
const TTL_MS = 10 * 60 * 1000;
```

On mount:

1. If cache exists and is within TTL → return cached values, `isLoading: false`.
2. Else → `Promise.all([fetchUserPlaylists, fetchRecentlyPlayed])` in parallel. Set cache on success.

`refresh()` invalidates and refetches. Wired to a circular-arrow icon in the Library tab header.

Multiple widgets on the same dashboard share the cache automatically — one fetch, N consumers.

### State model

`PersonalSpotifyBrowser` owns:

- `activeTab: 'library' | 'search' | 'now-playing'` (local state, default `library`)
- `isAudioActive: boolean` (derived from SDK player state or iframe presence)

The tap-to-play handler is hoisted to the Browser so all three tabs call the same function. The payload shape depends on the resource type — `playOnDevice` accepts `uris: string[]` for tracks and `contextUri: string` for playlists/albums:

```ts
const handlePlay = useCallback((result: SpotifyResource) => {
  updateWidget(widget.id, { config: { personalSpotifyUrl: result.uri } });
  if (isPremium && sdkReady) {
    const payload = result.type === 'track'
      ? { uris: [result.uri] }
      : { contextUri: result.uri };
    playOnDevice(token, deviceId, payload);
  }
  // Free users: writing the URL is enough — the Now Playing tab re-renders the iframe.
}, [...]);
```

## OAuth scope rotation

To call the new endpoints, three scopes are added to `SPOTIFY_SCOPES` in `utils/spotifyAuth.ts` **and** the parallel `REQUIRED_SPOTIFY_SCOPES` list in `functions/src/spotifyOAuth.ts`. The backend enforces full-consent at exchange time (`functions/src/spotifyOAuth.ts:246-254`) — if the frontend asks for a scope the backend doesn't expect, or vice versa, exchange will fail. Both lists must be updated in the same PR.

| Scope                         | Required for                                        |
| ----------------------------- | --------------------------------------------------- |
| `user-read-recently-played`   | Recently played section                             |
| `playlist-read-private`       | Reading the user's private playlists                |
| `playlist-read-collaborative` | Reading collaborative playlists they're a member of |

**Migration impact.** Any user already connected to personal Spotify (currently Paul + any admin beta testers, since `personal-spotify` is admin-gated by default per PR #1665) will have a token that lacks the new scopes. The first call to `/me/playlists` or `/me/player/recently-played` will return 403 with `error.message` describing insufficient scope.

**Detection and recovery.** The Browser detects this specific 403 shape and renders a one-time banner inside the Library tab:

> Your Spotify connection needs an update — your access has expanded. **Reconnect** to unlock playlists and recents.

Single tap on **Reconnect** runs the existing disconnect-and-reconnect flow. Once reconnected, the new token has the new scopes and the banner is gone.

The banner shows only on actual 403-scope errors, not generic auth failures. Non-scope 401/403s continue to bubble to the existing `useSpotifyAuth` recovery path.

## Settings panel simplification

`PersonalSpotifyPanel.tsx` (the back-face/settings) loses its "Spotify URL or search" input and result dropdown. After:

- Connect/disconnect Spotify (with Premium status badge — unchanged)
- Source toggle: curated · personal (unchanged)

Nothing else for personal mode. The search affordance lives on the front face's Search tab. URL paste is handled by the same input — pasting a Spotify URL into the search box parses to a single result the teacher can tap.

The `personalSpotifyUrl` config field stays. Same field, same persistence, just written-to by row taps on the front face instead of the back-face dropdown. No data migration needed.

## States

### Loading

Skeleton rows: three grey-thumb + grey-bar placeholder rows per section during the parallel fetch. No spinners, no "Loading…" text. Layout matches the real row, so there is no jump when data lands.

### Empty

Use the existing `ScaledEmptyState` for visual consistency.

- **Library, no playlists at all:** "No playlists in your Spotify account" + button to switch to Search tab.
- **Library, no recently-played:** hide the section header entirely — don't render an empty section.
- **Search, empty query:** "Type to search Spotify" + a duplicate of the Recently Played list as filler. If Recently Played is also empty, just the prompt.
- **Now Playing, nothing ever played:** "Pick something from your library or search to start" + button to switch to Library tab.

### Error

- **Network / 5xx:** section-level inline message "Couldn't load — tap to retry". The other section keeps working.
- **401 (token expired):** handled by `useSpotifyAuth` — silent refresh or full reconnect.
- **403 scope rotation (transitional):** dedicated banner described above. Single error type with a clear recovery action.

## Testing

### Unit tests (Vitest)

| File                                    | Coverage                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/utils/spotifyLibrary.test.ts`    | `fetchUserPlaylists` and `fetchRecentlyPlayed`: happy path, null-item tolerance, missing optional fields, 401/403/5xx error shapes                      |
| `tests/hooks/useSpotifyLibrary.test.ts` | Cache hit returns instantly, cache miss fetches in parallel, TTL expiry triggers refetch, `refresh()` invalidates, multiple subscribers share one fetch |

### Component tests

| File                                                                     | Coverage                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/components/widgets/MusicWidget/PersonalSpotifyBrowser.test.tsx`   | Tab switching (lazy mount), tap-to-play calls `playOnDevice` with correct URI, currently-playing indicator renders on the right row, green-dot indicator on Now Playing tab when audio active |
| `tests/components/widgets/MusicWidget/PersonalSpotifySearchTab.test.tsx` | Debounced search call (300ms), empty-query fallback to Recently Played, paste-URL-as-query still works                                                                                        |
| `tests/components/widgets/MusicWidget/scopeRotation403.test.tsx`         | 403-scope error from new endpoints renders the reconnect banner; banner tap clears state correctly                                                                                            |

### Skipping

- Now Playing tab SDK-player tests: code is moved, not changed; existing tests cover it.
- Free-user iframe rendering: it's a single `<iframe src={url}>`, not enough logic to mock.
- E2E (Playwright): requires a real Spotify session; we'd be testing Spotify, not us.

### Manual verification (on dev preview after deploy)

- [ ] Premium + connected: tap playlist row → SDK player plays in Now Playing tab
- [ ] Free user: tap track row → iframe loads in Now Playing tab
- [ ] Scope rotation: old-token user sees the banner; reconnect flow grants new scopes; banner clears
- [ ] Empty library: account with zero playlists doesn't crash; "no playlists" empty state renders
- [ ] Search: `jack johnson radio` returns results (null-playlist guard still in place from prior fix)
- [ ] Reload mid-playback: Now Playing tab restores at the last track (paused)
- [ ] Refresh icon: tap → cache invalidates → spinner → fresh data

## Open questions

None at design time. Implementation will resolve:

- Exact skeleton row markup (likely a small new component, `SpotifyRowSkeleton.tsx`)
- Whether the manual refresh icon lives in the Library tab header only, or also in Search
- Specific Spotify API response shape edge cases discovered during implementation (handled via the regression-test pattern established by `spotifyAuthSearch.test.ts`)

## Out of scope / future

- **Liked Songs** as a synthetic playlist. Requires `/me/tracks` + `user-library-read` scope. Worth a follow-up.
- **Quota Mode upgrade.** The current Spotify app is in Development Mode (25-user cap). Submitting for Extended Quota Mode is a separate Spotify-dashboard action, unblocked by this design but required before personal-spotify rolls beyond admin testers.
- **Queue management.** Spotify Web API supports queue operations; not in this iteration.
- **Discover Weekly / curated recommendations.** Would naturally appear in a user's playlists if they're a Spotify subscriber, but no special surface in this design.
