import type { WidgetConfig } from '../types';

/**
 * Config keys that should NOT be persisted globally when saving widget settings.
 * These are either runtime state (would cause broken initial state on new widgets)
 * or large instance-specific data (would bloat the user profile document).
 */
const TRANSIENT_CONFIG_KEYS = new Set<string>([
  // Timer/stopwatch runtime state
  'isRunning',
  'elapsedTime',
  'startTime',

  // Live session identifiers (ephemeral, would reference dead sessions)
  'activeLiveSessionCode',
  'resultsSessionId',
  'liveScoreboardWidgetId',
  'liveScoreboardEnabled',
  'activeActivityId',
  'playerSetId',

  // Navigation view state (should reset to landing page)
  'view',
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
  'lastResult',
  'remainingStudents',

  // Large instance data / per-session game state
  'paths',
  'furniture',
  'assignments',
  'completedNames',
  'cards',
  'memoryCards',
  'hotspots',
]);

/** Strips transient/runtime keys from a config object before persisting. */
export function stripTransientKeys(
  config: Partial<WidgetConfig>
): Partial<WidgetConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !TRANSIENT_CONFIG_KEYS.has(key))
  ) as Partial<WidgetConfig>;
}
