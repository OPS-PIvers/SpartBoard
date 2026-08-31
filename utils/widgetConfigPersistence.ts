import type { WidgetConfig, WidgetType } from '@/types';

/**
 * Top-level config keys that persist per-user as appearance defaults.
 * Everything else is per-board.
 *
 * This list is CLOSED. A new widget config key is per-board automatically and
 * needs no registration here — that is the default and it is the safe one. Only
 * add a key if it is purely visual and carries no lesson content, student
 * names, or teacher-authored text. Matching is top-level only: never add a key
 * that lives nested inside a content array (per-card colors, custom-widget
 * block styles) — those travel with their content.
 */
export const APPEARANCE_CONFIG_KEYS = new Set<string>([
  'fontFamily', // shared TypographySettings
  'fontColor', // shared TypographySettings
  'cardColor', // shared SurfaceColorSettings
  'cardOpacity', // shared SurfaceColorSettings
  'textSizePreset', // shared TextSizePresetSettings
  'bgColor', // TextConfig — sticky-note color
  'fontSize', // TextConfig
  'textColor', // MusicConfig
  'titleColor', // MaterialsConfig
  'scaleMultiplier', // ChecklistConfig
  'layout', // ScoreboardConfig | ExpectationsConfig | MusicConfig
]);

/**
 * Keys holding an explicit "save as preset" library, which teachers opt into
 * and expect to be account-wide. These live in the separate
 * `savedWidgetPresets` profile field, never in `savedWidgetConfigs`.
 */
export const PRESET_CONFIG_KEYS = new Set<string>(['savedLibrary']);

/** Keeps only appearance keys; everything else stays on its own board. */
export function pickAppearanceKeys(
  config: Partial<WidgetConfig>
): Partial<WidgetConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => APPEARANCE_CONFIG_KEYS.has(key))
  ) as Partial<WidgetConfig>;
}

/**
 * Merges the four widget config layers used when adding a widget to a dashboard.
 * Later layers override earlier ones (Object.assign semantics).
 *
 * Layer order:
 *   1. defaults     — from WIDGET_DEFAULTS[type].config (baseline)
 *   2. adminConfig  — from getAdminBuildingConfig (per-building admin defaults)
 *   3. saved        — from user's savedWidgetConfigs (appearance keys only)
 *   4. overrides    — explicit per-add overrides (e.g. AI-provided config, paste import)
 */
export function mergeWidgetConfig(
  defaults: Partial<WidgetConfig> | undefined,
  adminConfig: Record<string, unknown> | Partial<WidgetConfig> | undefined,
  saved: Partial<WidgetConfig> | undefined,
  overrides: Partial<WidgetConfig> | undefined
): WidgetConfig {
  return Object.assign(
    {},
    defaults ?? {},
    adminConfig ?? {},
    pickAppearanceKeys(saved ?? {}),
    overrides ?? {}
  ) as WidgetConfig;
}

export type SavedWidgetConfigMap = Partial<
  Record<WidgetType, Partial<WidgetConfig>>
>;

export interface SavedWidgetConfigMigration {
  /** True when the stored blob holds anything outside the appearance allowlist. */
  needsMigration: boolean;
  /** `savedWidgetConfigs` reduced to appearance keys only. */
  cleaned: SavedWidgetConfigMap;
  /** Preset libraries lifted out of the old store, keyed by widget type. */
  presets: SavedWidgetConfigMap;
}

/**
 * Splits a legacy `savedWidgetConfigs` blob into the appearance defaults that
 * may stay account-wide and the opt-in preset libraries that move to
 * `savedWidgetPresets`. Everything else — lesson content, student names,
 * teacher-authored text — is dropped, because it belongs to a single board.
 *
 * Pure: callers own the Firestore write.
 */
export function migrateSavedWidgetConfigs(
  raw: SavedWidgetConfigMap,
  existingPresets: SavedWidgetConfigMap = {}
): SavedWidgetConfigMigration {
  const cleaned: SavedWidgetConfigMap = {};
  const presets: SavedWidgetConfigMap = { ...existingPresets };
  let needsMigration = false;

  const entries = Object.entries(raw) as [string, unknown][];
  for (const [type, config] of entries) {
    if (typeof config !== 'object' || config === null) {
      needsMigration = true;
      continue;
    }
    const widgetType = type as WidgetType;
    const stored = config as Record<string, unknown>;
    const appearance = pickAppearanceKeys(stored as Partial<WidgetConfig>);
    if (Object.keys(appearance).length > 0) cleaned[widgetType] = appearance;

    for (const [key, value] of Object.entries(stored)) {
      if (APPEARANCE_CONFIG_KEYS.has(key)) continue;
      needsMigration = true;
      // A preset library the teacher saved on purpose — keep it, elsewhere.
      // Presets already in the new field win: they are the newer copy.
      if (PRESET_CONFIG_KEYS.has(key)) {
        const alreadyMoved = existingPresets[widgetType];
        if (alreadyMoved && key in alreadyMoved) continue;
        presets[widgetType] = { ...presets[widgetType], [key]: value };
      }
    }
  }

  return { needsMigration, cleaned, presets };
}
