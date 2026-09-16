import type { WidgetConfig } from '@/types';
import {
  mergeWidgetConfig,
  pickAppearanceKeys,
} from '@/utils/widgetConfigPersistence';

type Values = Record<string, unknown>;

export type StyleDefaultsState = {
  /** Appearance keys the widget, the baseline or the saved default touch. */
  keys: string[];
  /** True when this widget's appearance differs from what a new widget of its type gets. */
  differs: boolean;
  /** Only keys that differ from the building baseline, so later admin changes still reach new widgets. */
  toSave: Values;
  /** Config patch returning this widget to the effective default (undefined clears a key). */
  resetPatch: Values;
};

const appearance = (...layers: Array<Values | undefined>): Values =>
  pickAppearanceKeys(
    mergeWidgetConfig(
      layers[0] as Partial<WidgetConfig> | undefined,
      layers[1],
      layers[2] as Partial<WidgetConfig> | undefined,
      undefined
    )
  );

const same = (a: unknown, b: unknown) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

// Mirrors addWidget's layering (defaults → building → my default) for appearance keys only (D28).
export function computeStyleDefaults(
  current: Values | undefined,
  widgetDefaults: Values | undefined,
  buildingConfig: Values | undefined,
  saved: Values | undefined
): StyleDefaultsState {
  const baseline = appearance(widgetDefaults, buildingConfig);
  const effective = appearance(widgetDefaults, buildingConfig, saved);
  const mine = appearance(current);
  const keys = [
    ...new Set([
      ...Object.keys(baseline),
      ...Object.keys(effective),
      ...Object.keys(mine),
    ]),
  ].sort();

  const toSave: Values = {};
  const resetPatch: Values = {};
  let differs = false;
  for (const key of keys) {
    const value = mine[key] ?? baseline[key];
    if (value !== undefined && !same(value, baseline[key])) toSave[key] = value;
    if (!same(value, effective[key])) differs = true;
    resetPatch[key] = effective[key];
  }
  return { keys, differs, toSave, resetPatch };
}
