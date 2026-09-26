import { describe, expect, it } from 'vitest';
import { migrateWidget } from '@/utils/migration';
import { mergeWidgetConfig } from '@/utils/widgetConfigPersistence';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import type { ClockConfig, WidgetData } from '@/types';

const clockDefaults = WIDGET_DEFAULTS.clock.config as ClockConfig;

// Pre-migration fixture from docs/plans/shipped/widget-settings-inventory.md ("## clock").
const PRE_MIGRATION_CONFIG = {
  format24: true,
  showSeconds: true,
  fontFamily: 'global',
  clockStyle: 'modern',
  themeColor: '#0f172a',
  glow: false,
  dateColor: null,
};

const baseWidget = (config: unknown): WidgetData =>
  ({
    id: 'w1',
    type: 'clock',
    x: 0,
    y: 0,
    w: 280,
    h: 140,
    z: 1,
    config,
  }) as WidgetData;

describe('clock config migration', () => {
  it('has no registered migration steps (no key renames in this wave)', () => {
    const widget = baseWidget(PRE_MIGRATION_CONFIG);
    const migrated = migrateWidget(widget);
    // No steps registered for 'clock' -> config is untouched, only the version
    // stamp is added (schema.configVersion is omitted, so target is 0).
    expect(migrated.config).toEqual(PRE_MIGRATION_CONFIG);
    expect(migrated.configVersion).toBe(0);
  });

  it('is idempotent (running twice equals running once)', () => {
    const widget = baseWidget(PRE_MIGRATION_CONFIG);
    const once = migrateWidget(widget);
    const twice = migrateWidget(once);
    expect(twice).toEqual(once);
  });

  it('loses no key the front face reads', () => {
    const widget = baseWidget(PRE_MIGRATION_CONFIG);
    const migrated = migrateWidget(widget);
    const config = migrated.config as ClockConfig;
    for (const key of [
      'format24',
      'showSeconds',
      'fontFamily',
      'clockStyle',
      'themeColor',
      'glow',
      'dateColor',
    ] as const) {
      expect(config).toHaveProperty(key);
    }
  });

  it('round-trips through mergeWidgetConfig + migrateWidget without losing a key the front face reads', () => {
    // Simulate a saved-appearance-defaults merge (fontFamily is the only
    // appearance key clock declares via styleKeys) landing on a brand-new
    // widget, then loading it through the migration pipeline.
    const merged = mergeWidgetConfig(
      WIDGET_DEFAULTS.clock.config,
      undefined,
      { fontFamily: 'font-patrick-hand' },
      undefined
    );
    const migrated = migrateWidget(baseWidget(merged));
    const config = migrated.config as ClockConfig;
    expect(config.fontFamily).toBe('font-patrick-hand');
    expect(config.format24).toBe(true);
    expect(config.showSeconds).toBe(true);
    expect(config.clockStyle).toBe('modern');
    expect(config.themeColor).toBe(clockDefaults.themeColor);
    expect(config.glow).toBe(false);
    expect(migrated.configVersion).toBe(0);
  });
});
