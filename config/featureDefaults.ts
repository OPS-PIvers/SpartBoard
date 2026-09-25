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

import type {
  AccessLevel,
  GlobalFeature,
  InternalToolType,
  UserTier,
  WidgetType,
} from '@/types';

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
  // Student audio responses. Fail-closed on purpose: no permission record
  // means denied, matching `isQuizMediaResponseGranted` in
  // `functions/src/quizMediaArchive.ts`. Read it through
  // `canAccessQuizMediaResponse`, never `canAccessFeature`.
  'quiz-media-response': {
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
  },
  // Alpha rollout of the redesigned widget settings UI (wave 1b). Default-off
  // and admin-only until the drawer is verified across all widget types.
  'settings-drawer': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz read-aloud (Cloud TTS). Admin-only while the player ships in
  // stacked PRs; every teacher-side affordance hides until it is opened up.
  'quiz-read-aloud': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz translation for multilingual learners. Admin-only while the Languages
  // tab ships in stacked PRs; fail-closed so a missing doc grants nobody.
  'quiz-translation': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // "Draft with AI" in the question-bank editor; also requires gemini-functions.
  'question-bank-ai': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // AI reading of an imported test document; also requires quiz-document-import
  // and gemini-functions. Fail-closed, so nobody gets it until it is saved.
  'quiz-document-ai-reader': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Suggested learning targets in the test-import review. Admin-only until Paul has imported with it.
  'quiz-import-suggested-targets': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Print/scan paper answer sheets. Admin-only until opened up; the Rollouts
  // switch (admin_settings/paper_answer_sheets) must also be on.
  'paper-answer-sheets': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Saved class groups inside board widgets. Admin-only until the projector
  // privacy check passes; the Rollouts switch
  // (admin_settings/roster_groups_integration) must also be on.
  'roster-groups': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Import a quiz from a PDF, Word file or Google Doc. Admin-only while the
  // readers ship in stacked PRs; the Rollouts switch
  // (admin_settings/quiz_document_import) must also be on.
  'quiz-document-import': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Share a board or a collection with a substitute, and the manager for live
  // shares. Admin-only until Paul has run a day's cover on it in prod.
  'sub-share-collections': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning player v2. Admin-only until Paul has played a set end to end on dev.
  'gl-player-v2': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Tab-away clock and exit log. Admin-only until Paul has tested it in prod.
  'tab-away-timer': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning live tours that walk a teacher through the real app. Admin-only until opened up.
  'gl-live-tours': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning Studio editor. Admin-only until Paul has built sets with it in prod.
  'gl-studio': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Per-period start/pause on shared assignments. Admin-only until Paul has run a class on it.
  'per-period-access': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Printable quiz results for handing back. Admin-only until Paul has printed a class set.
  'quiz-results-print': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // PLC Home v2 tile dashboard. Admin-only until Paul has run a PLC on it in prod.
  'plc-home-v2': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // PLC norming flags: anonymized answer copies on the PLC page. Admin-only until Paul has tried it.
  'plc-norming-flags': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Choose-all-that-apply quiz questions. Admin-only until Paul has run one with a class.
  'quiz-choose-all': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // One-list multiple choice editor, choose-all as a setting on it. Admin-only until Paul has tried it.
  'quiz-choice-editor': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Alternate accepted answers on fill-in-the-blank quiz questions. Admin-only until Paul has tried it.
  'quiz-fib-alternates': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Full-screen toggle on large pop-ups. Admin-only until Paul has tried it on a Chromebook.
  'modal-fullscreen': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz results teacher tools. Admin-only until Paul has used them on a real class.
  'quiz-results-tools': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Free-response grader layout pass from the teacher feedback session. Admin-only until Paul has graded with it.
  'quiz-grader-v2': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Studio callout handles, toolbar and styling. Admin-only until Paul has edited sets with it in prod.
  'gl-callout-editing': {
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
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
 *     `GoogleCalendarService` — a Google-API surface, so org-and-up only.
 */
export const WIDGET_DEFAULT_MIN_TIER: Partial<Record<WidgetType, UserTier>> = {
  calendar: 'org',
};

/**
 * Missing-document access defaults for widget rollouts that must fail closed.
 * All unlisted widgets retain the historical public default.
 */
export const WIDGET_DEFAULT_ACCESS_LEVEL: Partial<
  Record<WidgetType, AccessLevel>
> = {
  flashcards: 'admin',
};

export const getWidgetDefaultAccessLevel = (
  widgetType: WidgetType | InternalToolType
): AccessLevel =>
  WIDGET_DEFAULT_ACCESS_LEVEL[widgetType as WidgetType] ?? 'public';
