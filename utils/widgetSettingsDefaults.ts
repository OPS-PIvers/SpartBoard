import type {
  ChecklistItem,
  DailySchedule,
  PollOption,
  ScoreboardTeam,
  WidgetType,
} from '@/types';
import { toDefaultSchedules } from '@/components/widgets/Schedule/defaultSchedules';
import { APPEARANCE_CONFIG_KEYS } from '@/utils/widgetConfigPersistence';
import { stableStringify } from '@/utils/stableStringify';

type Values = Record<string, unknown>;

/** The key under `savedWidgetPresets[type]` holding a teacher's saved Settings-tab default. */
export const SETTINGS_DEFAULT_PRESET_KEY = 'settingsDefault';

// Notices, navigation, student names and class-group links: never account-wide.
const NEVER_SAVED = new Set([
  'managedNotice',
  'manageNotice',
  'view',
  'firstNames',
  'lastNames',
  'names',
  'completedNames',
  'rosterPoolGroupId',
  'lockedRosterGroupIds',
]);

/** Keys a field writes alongside its declared one, saved and reset together. */
const COMPANION_KEYS: Partial<Record<WidgetType, readonly string[]>> = {
  'concept-web': ['edges'],
  'reveal-grid': ['memoryCards'],
};

// Largest saved default, so one huge config can't break every later preset save.
export const SETTINGS_DEFAULT_MAX_CHARS = 200_000;

/** Live data and links to other widgets on one board; a saved default never carries them. */
export const SETTINGS_DEFAULT_EXCLUDED_KEYS: Partial<
  Record<WidgetType, readonly string[]>
> = {
  poll: ['activePollSessionId'],
  nextUp: ['activeDriveFileId'],
  weather: ['temp', 'condition', 'lastSync'],
  random: ['lastResult', 'remainingStudents'],
  recessGear: ['linkedWeatherWidgetId'],
  sound: ['quietGoalTeamId', 'quietGoalScoreboardId'],
  'time-tool': ['startLength'],
  pdf: ['activePdfId'],
  'reveal-grid': ['activeDriveFileId'],
  drawing: ['background'],
};

type Normalizer = (
  picked: Values,
  config: Values,
  keys: readonly string[]
) => Values;

const resolveSchedules = (config: Values): DailySchedule[] => {
  const schedules = (config.schedules as DailySchedule[] | undefined) ?? [];
  if (schedules.length > 0) return schedules;
  const items = (config.items as DailySchedule['items'] | undefined) ?? [];
  return items.length > 0
    ? [{ id: 'default', name: 'Default Schedule', items, days: [] }]
    : [];
};

// Per-type cleanup so a new widget starts fresh: no check marks, scores or today-only events.
const NORMALIZERS: Partial<Record<WidgetType, Normalizer>> = {
  schedule: (picked, config, keys) =>
    keys.includes('schedules')
      ? {
          ...picked,
          schedules: toDefaultSchedules(resolveSchedules(config)),
          items: [],
          settingsSelectedScheduleId: undefined,
        }
      : picked,
  checklist: (picked) =>
    Array.isArray(picked.items)
      ? {
          ...picked,
          items: (picked.items as ChecklistItem[]).map((item) => ({
            ...item,
            completed: false,
          })),
        }
      : picked,
  scoreboard: (picked) =>
    Array.isArray(picked.teams)
      ? {
          ...picked,
          teams: (picked.teams as ScoreboardTeam[]).map(
            ({
              linkedGroupId: _linked,
              linkedRosterGroupId: _rosterGroup,
              memberStudentIds: _students,
              ...team
            }) => ({ ...team, score: 0 })
          ),
        }
      : picked,
  poll: (picked) =>
    Array.isArray(picked.questions)
      ? {
          ...picked,
          questions: (picked.questions as Values[]).map((question) =>
            Array.isArray(question.options)
              ? {
                  ...question,
                  options: (question.options as PollOption[]).map((option) => ({
                    ...option,
                    votes: 0,
                  })),
                }
              : question
          ),
        }
      : picked,
  'reveal-grid': (picked) =>
    Array.isArray(picked.cards)
      ? {
          ...picked,
          cards: (picked.cards as Values[]).map((card) => ({
            ...card,
            isRevealed: false,
          })),
        }
      : picked,
  'need-do-put-then': (picked) =>
    Object.fromEntries(
      Object.entries(picked).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.map((tile: unknown) =>
              tile && typeof tile === 'object'
                ? { ...(tile as Values), checked: false }
                : tile
            )
          : value,
      ])
    ),
  instructionalRoutines: (picked) =>
    Array.isArray(picked.customSteps)
      ? {
          ...picked,
          customSteps: (picked.customSteps as Values[]).map(
            ({ attachedWidget: _attached, ...step }) => step
          ),
        }
      : picked,
};

/** Top-level config keys a widget's Settings default covers: its schema fields, minus appearance and live data. */
export function settingsDefaultKeys(
  type: WidgetType,
  fieldKeys: readonly string[]
): string[] {
  const excluded = new Set(SETTINGS_DEFAULT_EXCLUDED_KEYS[type] ?? []);
  return [...new Set([...fieldKeys, ...(COMPANION_KEYS[type] ?? [])])]
    .filter(
      (key) =>
        !APPEARANCE_CONFIG_KEYS.has(key) &&
        !NEVER_SAVED.has(key) &&
        !excluded.has(key)
    )
    .sort();
}

/** The part of a widget's config a saved default would hold. */
export function pickSettingsDefault(
  type: WidgetType,
  keys: readonly string[],
  config: Values | undefined
): Values {
  const source = config ?? {};
  const picked: Values = {};
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  const normalize = NORMALIZERS[type];
  return normalize ? normalize(picked, source, keys) : picked;
}

/** The teacher's saved Settings-tab default for a widget type, if any. */
export function readSavedSettingsDefault(
  presets: Partial<Record<WidgetType, unknown>> | undefined,
  type: WidgetType
): Values | undefined {
  const entry = presets?.[type] as Values | undefined;
  const saved = entry?.[SETTINGS_DEFAULT_PRESET_KEY];
  return saved && typeof saved === 'object' ? (saved as Values) : undefined;
}

/** A saved default with its excluded keys stripped, in case the exclusions grew after it was saved. */
export function cleanSavedSettingsDefault(
  type: WidgetType,
  saved: Values | undefined
): Values | undefined {
  if (!saved || typeof saved !== 'object') return undefined;
  const excluded = new Set(SETTINGS_DEFAULT_EXCLUDED_KEYS[type] ?? []);
  const cleaned = Object.fromEntries(
    Object.entries(saved).filter(
      ([key, value]) =>
        value !== null &&
        !excluded.has(key) &&
        !NEVER_SAVED.has(key) &&
        !APPEARANCE_CONFIG_KEYS.has(key)
    )
  );
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export type SettingsDefaultsState = {
  keys: string[];
  /** True when this widget's settings differ from what a new widget of its type gets. */
  differs: boolean;
  /** Too big to keep in the profile; saving is turned off. */
  tooLarge: boolean;
  /** What "Save as my default" stores; null marks a key this widget leaves unset. */
  toSave: Values;
  /** Config patch returning this widget to the effective default (undefined clears a key). */
  resetPatch: Values;
};

// Mirrors addWidget's layering (defaults, building, my default) for the Settings-tab keys.
export function computeSettingsDefaults(
  type: WidgetType,
  keys: readonly string[],
  current: Values | undefined,
  widgetDefaults: Values | undefined,
  buildingConfig: Values | undefined,
  saved: Values | undefined
): SettingsDefaultsState {
  const effectiveConfig = {
    ...widgetDefaults,
    ...buildingConfig,
    ...cleanSavedSettingsDefault(type, saved),
  };
  const mine = pickSettingsDefault(type, keys, current);
  const effective = pickSettingsDefault(type, keys, effectiveConfig);
  const resetPatch: Values = {};
  for (const key of new Set([...keys, ...Object.keys(effective)])) {
    resetPatch[key] = effective[key];
  }
  const mineText = stableStringify(mine);
  return {
    keys: [...keys],
    differs: mineText !== stableStringify(effective),
    tooLarge: mineText.length > SETTINGS_DEFAULT_MAX_CHARS,
    // Unset keys go as null: the profile write deep-merges, so a missing key would keep its old value.
    toSave: {
      ...Object.fromEntries(keys.map((key) => [key, null])),
      ...mine,
    },
    resetPatch,
  };
}
