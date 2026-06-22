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

import type { AccessLevel, GlobalFeature, UserTier, WidgetType } from '@/types';

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
  /**
   * Default minimum tier applied by `canAccessFeature(...)` when NO permission
   * doc exists (docs/wide-distro-plan.md Phase 3). This is the in-code default
   * for the wide-distribution Google-API gate: an external/free-tier user is
   * denied while org + internal pass, without needing a hand-authored admin
   * doc. Undefined ⇒ no tier floor (the historical baseline; every feature
   * written before the tier model behaves exactly as before).
   *
   * Note: this default ONLY applies to the missing-doc path. Once an admin
   * persists a `global_permissions/{featureId}` doc, that doc's own `minTier`
   * field (which may be unset) is authoritative — the admin can loosen or
   * tighten it, and an explicitly-unset `minTier` on a real doc means "no
   * floor", matching the pre-tier back-compat contract.
   *
   * Admins always bypass tier checks (same as accessLevel), so this never
   * affects an admin's own access.
   */
  defaultMinTier?: UserTier;
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
  // Google-API-backed (attaches Google Drive files as AI context). Default
  // tier floor of `org` denies external/free-tier users — they have only the
  // basic OAuth scopes and no Drive integration — while org + internal pass
  // (docs/wide-distro-plan.md Phase 3: free tier "excludes all Google-API
  // features"). The `useFeaturePermission`-gated affordances hide cleanly.
  'ai-file-context': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
    defaultMinTier: 'org',
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
  // Google-API-backed (assign quizzes/video activities to Google Classroom +
  // push grades). Default-public keeps the historical missing-doc convention
  // for the accessLevel, but a default tier floor of `org` denies
  // external/free-tier users (basic scopes only) while org + internal pass
  // (docs/wide-distro-plan.md Phase 3: free tier "excludes all Google-API
  // features"). An admin can still tighten to `internal` via a persisted doc;
  // that doc's own `minTier` then takes over. The `canAccessFeature
  // ('google-classroom')`-gated affordances (VideoActivity assign + results,
  // quiz Classroom push) hide cleanly.
  'google-classroom': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
    defaultMinTier: 'org',
  },
  // Default-public preserves today's behavior: every teacher keeps the
  // no-sign-in (anonymous) join link until an admin creates a restricting
  // doc (docs/wide-distro-plan.md Phase 3b). Gates the TEACHER's ability to
  // offer the link, not the participant join experience.
  'anonymous-join': {
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
};

/**
 * In-code default minimum tier per widget, applied by `canAccessWidget(...)`
 * when NO `feature_permissions/{widgetType}` doc exists yet
 * (docs/wide-distro-plan.md Phase 3).
 *
 * Mirrors `FeatureDefault.defaultMinTier` but for the widget gate: a
 * Google-API-backed widget defaults to `'org'` so external/free-tier users
 * (basic OAuth scopes, no Google integration) are denied while org + internal
 * pass — without an admin needing to hand-author a permission doc. The Dock /
 * widget library already hide widgets where `canAccessWidget` is false, so the
 * affordance disappears cleanly rather than erroring.
 *
 * Only widgets that actually need a tier floor are listed; an absent entry
 * means "no floor" (the historical public-by-default behavior for widgets with
 * no permission doc). Once an admin persists a `feature_permissions/{widgetType}`
 * doc, that doc's own `minTier` is authoritative and this default no longer
 * applies (matching the doc-wins precedence of the feature path).
 *
 *   - `calendar` (label "Events") renders Google Calendar events via
 *     `useGoogleCalendar` — a Google-API surface, so org-and-up only.
 */
export const WIDGET_DEFAULT_MIN_TIER: Partial<Record<WidgetType, UserTier>> = {
  calendar: 'org',
};
