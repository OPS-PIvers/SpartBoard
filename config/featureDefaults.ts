/**
 * Single source of truth for global-feature defaults.
 *
 * Three concerns previously kept their own parallel lookups:
 *
 *   1. `canAccessFeature` (in `AuthContext`) — what does the runtime
 *      gate return when no `global_permissions` doc exists yet?
 *   2. `getPermission` / `filteredFeatures` (in
 *      `GlobalPermissionsManager`) — what synthetic permission object
 *      does the admin editor show before any doc is persisted?
 *   3. The implicit assumption that those two stay aligned so an
 *      admin sees the same enabled/accessLevel state as users do.
 *
 * Drift between those three lookups was the bug class we got tired
 * of fixing one feature at a time. Funnel everything through
 * `FEATURE_DEFAULTS` so adding a new `GlobalFeature` requires
 * declaring its defaults in one place — and TypeScript refuses to
 * compile the union extension until you do, because the table is
 * typed as `Record<GlobalFeature, ...>` (NOT `Partial<...>`).
 *
 * @see context/AuthContext.tsx — consumes `missingDocPublic`.
 * @see components/admin/GlobalPermissionsManager.tsx — consumes
 *   `defaultAccessLevel` and `defaultEnabled` to build the synthetic
 *   permission object.
 */

import type { AccessLevel, GlobalFeature } from '@/types';

export interface FeatureDefault {
  /** Access level used by the admin UI when no permission doc exists yet. */
  defaultAccessLevel: AccessLevel;
  /** Enabled value used by the admin UI when no permission doc exists yet. */
  defaultEnabled: boolean;
  /**
   * When TRUE, `canAccessFeature(...)` returns true when no permission
   * doc exists (default-public — the historical baseline). When FALSE,
   * returns false (default-off).
   *
   * Use FALSE for features that depend on external configuration
   * (OAuth secrets, redirect URIs, API keys) and would surface a
   * broken UX if the code defaulted to enabled without an explicit
   * admin opt-in. `personal-spotify` is the current example: shipping
   * the code is not the same as shipping the OAuth setup.
   */
  missingDocPublic: boolean;
}

/**
 * Required defaults for every global feature.
 *
 * The `Record<GlobalFeature, FeatureDefault>` (NOT `Partial`) is
 * load-bearing: TypeScript will reject any new `GlobalFeature` union
 * member that doesn't declare its defaults here. Keep this honest —
 * don't add features to the union without adding a corresponding
 * entry, even if the entry is just the "all public, all on" baseline.
 *
 * Note on `share-link-tracking`: `canAccessFeature('share-link-tracking')`
 * returns the usual default-public behavior. `canSeeShareTracking()`
 * is a separate gate that diverges to admin-only — see
 * `AuthContextValue.ts` for why the divergence is intentional. This
 * table covers the `canAccessFeature` path only.
 */
export const FEATURE_DEFAULTS: Record<GlobalFeature, FeatureDefault> = {
  'live-session': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'gemini-functions': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'dashboard-sharing': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'dashboard-import': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'magic-layout': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'smart-paste': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'smart-poll': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'screen-recording': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'remote-control': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'embed-mini-app': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'video-activity-audio-transcription': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'ai-file-context': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'org-admin-writes': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'assignment-modes': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'share-link-tracking': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'personal-spotify': {
    defaultAccessLevel: 'public',
    defaultEnabled: false,
    missingDocPublic: false,
  },
  // Default-public matches the historical missing-doc convention; the
  // intended restriction is an admin-created doc with `minTier:
  // 'internal'` (docs/wide-distro-plan.md Phase 3), not a default-off.
  'google-classroom': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
};
