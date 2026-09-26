import { describe, expect, it } from 'vitest';
import { migrateWidget } from '@/utils/migration';
import { mergeWidgetConfig } from '@/utils/widgetConfigPersistence';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import type { TextConfig, WidgetData } from '@/types';

// Pre-migration fixture from docs/plans/shipped/widget-settings-inventory.md ("## text").
const PRE_MIGRATION_CONFIG: TextConfig = {
  content: '<p>Hello class!</p>',
  bgColor: '#fef9c3',
  fontSize: 18,
  fontFamily: 'global',
  fontColor: '#334155',
  verticalAlign: 'center',
};

function makeWidget(config: TextConfig): WidgetData {
  return {
    id: 'w1',
    type: 'text',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config,
  } as WidgetData;
}

describe('text widget config migration', () => {
  it('stamps configVersion 0 without changing the config (no migration steps registered)', () => {
    const migrated = migrateWidget(makeWidget(PRE_MIGRATION_CONFIG));
    expect(migrated.config).toEqual(PRE_MIGRATION_CONFIG);
    expect(migrated.configVersion).toBe(0);
  });

  it('is idempotent', () => {
    const once = migrateWidget(makeWidget(PRE_MIGRATION_CONFIG));
    const twice = migrateWidget(once);
    expect(twice.config).toEqual(once.config);
    expect(twice.configVersion).toBe(once.configVersion);
  });

  it('round-trips through mergeWidgetConfig + migrateWidget without losing a key the front face reads', () => {
    // Saved carries the styleKeys; boardOverride carries the per-board keys.
    const saved: Partial<TextConfig> = {
      fontFamily: PRE_MIGRATION_CONFIG.fontFamily,
      fontColor: PRE_MIGRATION_CONFIG.fontColor,
    };
    const boardOverride: Partial<TextConfig> = {
      content: PRE_MIGRATION_CONFIG.content,
      bgColor: PRE_MIGRATION_CONFIG.bgColor,
      fontSize: PRE_MIGRATION_CONFIG.fontSize,
      verticalAlign: PRE_MIGRATION_CONFIG.verticalAlign,
    };
    const merged = mergeWidgetConfig(
      WIDGET_DEFAULTS.text.config,
      undefined,
      saved,
      boardOverride
    );
    const migrated = migrateWidget(makeWidget(merged as TextConfig));
    const config = migrated.config as TextConfig;

    expect(config.content).toBe(PRE_MIGRATION_CONFIG.content);
    expect(config.bgColor).toBe(PRE_MIGRATION_CONFIG.bgColor);
    expect(config.fontSize).toBe(PRE_MIGRATION_CONFIG.fontSize);
    expect(config.fontFamily).toBe(PRE_MIGRATION_CONFIG.fontFamily);
    expect(config.fontColor).toBe(PRE_MIGRATION_CONFIG.fontColor);
    expect(config.verticalAlign).toBe(PRE_MIGRATION_CONFIG.verticalAlign);
  });
});
