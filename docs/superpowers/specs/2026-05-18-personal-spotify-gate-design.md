# Personal Spotify Global Feature Gate

**Date:** 2026-05-18
**Status:** Implemented (PR #1665)
**Related:** PR #1662 (per-teacher Spotify auth in Music widget)

## Problem

PR #1662 ships per-teacher Spotify OAuth so any teacher can connect their personal Spotify account in the Music widget. There is no admin-level switch to control rollout — once deployed, every authenticated user who can access the Music widget can see the "My Spotify" source mode and trigger an OAuth popup.

We need a gate so admins can:

- Toggle the personal Spotify mode on/off org-wide
- Roll it out by access level (admin only / beta testers / all teachers)
- Optionally restrict access to specific buildings

When the gate excludes a user — disabled, wrong access level, or wrong building — the personal Spotify UI must be **entirely hidden, as if it does not exist**. The Music widget continues to function with curated stations.

## Out of scope

- Admin-enforced building membership. The gate reads the user's self-managed `selectedBuildings`. A determined teacher can change their building selection to satisfy the gate; the OAuth callables themselves remain ungated server-side, so the worst case is the teacher sees the source toggle and connects their own Spotify account — no data leak.
- Server-side enforcement of the gate in the OAuth callables. The 15 existing global features are UI-only gates; this feature follows that convention.
- Backfilling building-gating to the existing 15 global features. None has been asked for.
- A "drop all stored Spotify tokens" admin action. The existing per-user revoke is sufficient; a user re-enabling the gate just resumes their previous connection.
- Rewriting any teacher's saved widget config. A `source: 'personal'` value persists across gate flips and reactivates when the gate is re-enabled.

## Design

### Data model (`types.ts`)

Add `'personal-spotify'` to the `GlobalFeature` union.

Add an optional `buildings?: string[]` field to `GlobalFeaturePermission`:

```ts
export interface GlobalFeaturePermission {
  featureId: GlobalFeature;
  accessLevel: AccessLevel;
  betaUsers: string[];
  enabled: boolean;
  /** Building IDs allowed access. Empty/undefined = all buildings. */
  buildings?: string[];
  config?: Record<string, unknown>;
}
```

The field is optional, so the 15 existing `/global_permissions/*` documents need no migration. Any future global feature can opt into building-gating by setting this field; the enforcement is centralized in `canAccessFeature`.

### Gate enforcement (`AuthContext.canAccessFeature`)

Update the existing `canAccessFeature(featureId)` to consult `permission.buildings` after the access-level check:

```
canAccessFeature(featureId):
  permission = globalPermissions.find(featureId)
  if !permission         → false   (see "Defaults" below)
  if !permission.enabled → false

  accessLevelOk = check accessLevel against user
    admin   → isAdmin
    beta    → isAdmin OR user.email in betaUsers
    public  → true
  if !accessLevelOk → false

  if permission.buildings && permission.buildings.length > 0:
    buildingOk = selectedBuildings.some(b => permission.buildings.includes(b))
    if !buildingOk → false

  return true
```

Two notes on the building check:

1. Empty array OR `undefined` both mean "no building restriction" — admins can save the doc without ever picking a building and the feature applies org-wide.
2. The intersection is "user is in ≥1 allowed building." A user in multiple buildings only needs one match.

### Defaults — what happens when no permission doc exists

For `'personal-spotify'`, missing-doc default is **`false` (gate off)**. This matches the precedent set by `canSeeShareTracking`:

> Deploying this code without seeding the `global_permissions` doc leaves teachers unaffected.

This is intentionally more conservative than the per-widget `canAccessWidget` default (which defaults to public). Rationale: the personal Spotify mode depends on Firebase Functions secrets, Spotify dashboard redirect URIs, and an OAuth flow. If any of these are misconfigured, defaulting to ON would surface a broken Connect button to every teacher. Default-off forces explicit opt-in by an admin who has verified setup.

The default is enforced inside `canAccessFeature` itself via a small per-feature default-policy map (one entry: `'personal-spotify' → false`). Other global features keep their existing defaults — the map starts as a single entry and grows only when a feature wants non-default behavior. No new wrapper hook needed.

### Admin UI (`components/admin/GlobalPermissionsManager.tsx`)

Add `'personal-spotify'` to the `GLOBAL_FEATURES` array, using the `Music2` icon (already imported elsewhere) and a description like _"Let teachers connect their personal Spotify account in the Music widget. When off, Music shows only curated stations."_

Add a building multi-select control that renders inside every feature row. The control is generic and only shown when the admin chooses to restrict to specific buildings; when empty it displays "All buildings" as a pill. The implementation plan will inspect `components/admin/BuildingSelector.tsx` and either reuse it directly or build a thin wrapper around the same `config/buildings.ts` data source so the building list stays consistent with the rest of the admin UI.

Writing `buildings: []` on save is equivalent to omitting the field — both mean "no restriction." We store `[]` rather than omitting so the Firestore doc shape is explicit and predictable for any future tooling.

### Music widget gating (3 small render-time changes)

These three changes implement the "entirely hidden" requirement without touching any stored widget configs:

1. **`components/widgets/MusicWidget/Settings.tsx`** — wrap the "Source" toggle in `canAccessFeature('personal-spotify') && ...`. When ungated, only the curated body renders; no toggle, no hint that another source exists.

2. **`components/widgets/MusicWidget/Widget.tsx`** — at the top-level dispatch:

   ```ts
   const canPersonal = canAccessFeature('personal-spotify');
   const effectiveSource =
     canPersonal && config.source === 'personal' ? 'personal' : 'curated';
   ```

   A stored `source: 'personal'` is silently treated as curated when the gate is off. The widget never renders `PersonalSpotifyPanel` or `PersonalSpotifyPlayer` in that case. When the gate is re-enabled (or the user moves into an allowed building), the stored config takes effect again with no user action required.

3. **`components/spotify/SpotifyCallback.tsx` route** — left as-is. The callback only `postMessage`s to its opener and closes itself; an ungated user cannot trigger a Connect that would lead them here.

### What does NOT change

- `functions/src/spotifyOAuth.ts` and the three deployed callables (`exchangeSpotifyAuthCode`, `refreshSpotifyAccessToken`, `revokeSpotifyAuth`) — left functional. Any user who calls them directly without the UI just writes/reads tokens under their own uid. Per existing global-feature convention, the gate is UI-only.
- The 15 existing `/global_permissions/*` documents — the new `buildings` field is optional.
- Any teacher's stored widget configs — never rewritten.

## Rollout

1. Deploy the type/UI/gate changes.
2. In Global Settings, seed the `personal-spotify` permission doc:
   - `enabled: true`
   - `accessLevel: 'admin'` (start narrow — only admins see the source toggle)
   - `buildings: []` (no building restriction, or a small pilot list)
3. Verify in one admin account that the source toggle appears and the OAuth flow completes.
4. Widen to `'beta'` with a small `betaUsers` list, then to `'public'` after testing.
5. Until step 2 runs, the missing-doc default of `false` means no teacher sees the source toggle — safe state for production deploy without seeded permission.

## Testing

### Unit tests

- `canAccessFeature` returns `false` when `permission.buildings` set and user's `selectedBuildings` has no overlap.
- `canAccessFeature` returns `true` when `permission.buildings` is `[]` or `undefined` (no restriction) and the access-level check passes.
- `canAccessFeature` returns `true` when `permission.buildings` has at least one of the user's selected buildings, AND access level passes.
- `canAccessFeature('personal-spotify')` returns `false` when no permission doc exists (default-off precedent).

### Component tests

- `MusicWidget/Settings.tsx`: Source toggle is rendered when `canAccessFeature` returns true, hidden when false.
- `MusicWidget/Widget.tsx`: With `config.source = 'personal'` and `canAccessFeature` returning false, renders the curated body (no `PersonalSpotifyPlayer` mounted).
- `MusicWidget/Widget.tsx`: With `config.source = 'personal'` and `canAccessFeature` returning true, renders `PersonalSpotifyPlayer`.

### Admin UI tests

- `GlobalPermissionsManager`: Saving a permission with `buildings: []` and then with `buildings: ['b1', 'b2']` produces the correct Firestore doc shape (round-trips).

### Out of scope for this spec's testing

- OAuth callable changes (none).
- Existing 15 global features' permission behavior (unchanged).

## Open questions

None at design time. All major decisions resolved during brainstorming:

- Scope: personal Spotify source mode only (not all Spotify content, not the whole widget).
- Building semantics: empty = all buildings; non-empty = restrict.
- Fallback: render-time transparent fallback to curated, stored config preserved.
- Default state: gate off when permission doc missing.
- Building source: user-managed `selectedBuildings` (soft gate, acceptable for this app).
