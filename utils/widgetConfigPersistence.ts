import type { WidgetConfig } from '@/types';
import { PII_WIDGET_FIELDS } from './dashboardPII';

/**
 * Config keys that should NOT be persisted globally when saving widget settings.
 * These are either runtime state (would cause broken initial state on new widgets)
 * or large instance-specific data (would bloat the user profile document).
 */
const TRANSIENT_CONFIG_KEYS = new Set<string>([
  // Student PII — must never reach Firestore via savedWidgetConfigs
  ...PII_WIDGET_FIELDS,

  // Timer/stopwatch runtime state
  'isRunning',
  'elapsedTime',
  'startTime',

  // Live session identifiers (ephemeral, would reference dead sessions)
  'activeLiveSessionCode',
  'activeAssignmentId',
  'resultsSessionId',
  'liveScoreboardWidgetId',
  'liveScoreboardEnabled',
  'activeActivityId',
  'playerSetId',

  // Navigation view state (should reset to landing page)
  'view',
  'managerTab',
  'selectedQuizId',
  'selectedQuizTitle',
  'selectedActivityId',
  'selectedActivityTitle',

  // Remote/capture ephemeral data
  'remoteCaptureDataUrl',
  'remoteCaptureTimestamp',

  // Cross-widget instance references (widget IDs don't survive across sessions)
  'liveQuizWidgetId',
  'linkedWeatherWidgetId',
  'externalTrigger',
  'parentWidgetId',

  // Instance-specific runtime data
  'isActive',
  'startedAt',
  'createdAt',
  'lastUpdated',
  'activeDriveFileId',
  'sessionName',
  'activities',
  'draftActivity',
  'activeApp',
  'activeAppUnsaved',
  'activeNotebookId',
  'placedAssets',
  'lastResult',

  // Randomizer Jigsaw mode: per-pick group state (jigsaw*Groups also contain
  // student names in custom-roster mode, so they must never be saved as a
  // global default).
  'jigsawHomeGroups',
  'jigsawExpertGroups',
  'jigsawView',

  // Large instance data / per-session game state
  'paths',
  'furniture',
  'assignments',
  'cards',
  'memoryCards',
  'hotspots',

  // User-typed instance content: styling should carry over to new widgets,
  // but the text/notes themselves belong to a single instance only.
  'content',
]);

// Keys where adminConfig wins over saved — but only when adminConfig actually provides them.
// getAdminBuildingConfig only sets these when the admin has explicitly configured non-empty values,
// so presence in adminConfig is a reliable signal that the admin has taken ownership.
const ADMIN_WINS_WHEN_PRESENT = new Set<string>(['markers', 'jumps']);

/** Strips transient/runtime keys from a config object before persisting. */
export function stripTransientKeys(
  config: Partial<WidgetConfig>
): Partial<WidgetConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !TRANSIENT_CONFIG_KEYS.has(key))
  ) as Partial<WidgetConfig>;
}

/**
 * Merges the four widget config layers used when adding a widget to a dashboard.
 * Later layers override earlier ones (Object.assign semantics).
 *
 * Layer order:
 *   1. defaults     — from WIDGET_DEFAULTS[type].config (baseline)
 *   2. adminConfig  — from getAdminBuildingConfig (per-building admin defaults)
 *   3. saved        — from user's savedWidgetConfigs (transient keys are stripped here)
 *   4. overrides    — explicit per-add overrides (e.g. AI-provided config, paste import)
 *
 * For ADMIN_WINS_WHEN_PRESENT keys (e.g. markers, jumps): adminConfig takes precedence over
 * saved only when it actually provides the key. When adminConfig omits them (building has no
 * defaults configured), saved config is preserved so teacher templates are not silently lost.
 */
export function mergeWidgetConfig(
  defaults: Partial<WidgetConfig> | undefined,
  adminConfig: Record<string, unknown> | Partial<WidgetConfig> | undefined,
  saved: Partial<WidgetConfig> | undefined,
  overrides: Partial<WidgetConfig> | undefined
): WidgetConfig {
  const strippedSaved = Object.fromEntries(
    Object.entries(stripTransientKeys(saved ?? {})).filter(
      ([key]) =>
        !(
          ADMIN_WINS_WHEN_PRESENT.has(key) &&
          adminConfig != null &&
          key in adminConfig
        )
    )
  ) as Partial<WidgetConfig>;

  return Object.assign(
    {},
    defaults ?? {},
    adminConfig ?? {},
    strippedSaved,
    overrides ?? {}
  ) as WidgetConfig;
}
