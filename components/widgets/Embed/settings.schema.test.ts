import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import {
  WIDGET_CONFIG_MIGRATIONS,
  migrateWidget,
  targetConfigVersion,
} from '@/utils/migration';
import { mergeWidgetConfig } from '@/utils/widgetConfigPersistence';
import type { EmbedConfig, WidgetData } from '@/types';
import schema from './settings.schema';

describe('embed settings schema', () => {
  it('has no validation errors', () => {
    const result = validateSchema('embed', schema);
    expect(result.errors).toEqual([]);
  });

  it('has no missing-default warnings (url/html/mode/refreshInterval all default in WIDGET_DEFAULTS)', () => {
    const result = validateSchema('embed', schema);
    expect(result.warnings).toEqual([]);
  });

  it('has no styleKeys (front face reads no APPEARANCE_CONFIG_KEYS member)', () => {
    expect(schema.styleKeys ?? []).toEqual([]);
  });

  it('has no configVersion bump (no key renames in this migration)', () => {
    expect(targetConfigVersion('embed')).toBe(0);
    expect(WIDGET_CONFIG_MIGRATIONS.embed ?? []).toEqual([]);
  });
});

describe('embed config migration', () => {
  // Pre-migration fixture from docs/plans/shipped/widget-settings-inventory.md.
  const fixture: WidgetData = {
    id: 'w1',
    type: 'embed',
    x: 0,
    y: 0,
    w: 480,
    h: 350,
    z: 1,
    flipped: false,
    config: {
      mode: 'url',
      url: 'https://example.com',
      isEmbeddable: true,
      blockedReason: '',
      html: '',
      refreshInterval: 0,
    } as EmbedConfig,
  };

  it('is a no-op besides stamping configVersion', () => {
    const migrated = migrateWidget(fixture);
    expect(migrated.config).toEqual(fixture.config);
    expect(migrated.configVersion).toBe(0);
  });

  it('is idempotent', () => {
    const once = migrateWidget(fixture);
    const twice = migrateWidget(once);
    expect(twice).toEqual(once);
  });

  it('loses no key the front face reads on a mergeWidgetConfig + migrateWidget round trip', () => {
    const defaults = WIDGET_DEFAULTS.embed.config as Partial<EmbedConfig>;
    const merged = mergeWidgetConfig(defaults, undefined, undefined, {
      url: 'https://example.org',
      mode: 'code',
      html: '<h1>hi</h1>',
      refreshInterval: 5,
      isEmbeddable: false,
      blockedReason: 'X-Frame-Options',
      zoom: 1.5,
      autoplay: true,
      startAtSeconds: 30,
    } as Partial<EmbedConfig>);
    const migrated = migrateWidget({ ...fixture, config: merged });

    const frontFaceReadKeys: (keyof EmbedConfig)[] = [
      'mode',
      'url',
      'html',
      'refreshInterval',
      'isEmbeddable',
      'blockedReason',
      'zoom',
      'autoplay',
      'startAtSeconds',
    ];
    for (const key of frontFaceReadKeys) {
      expect((migrated.config as EmbedConfig)[key]).toBe(
        (merged as EmbedConfig)[key]
      );
    }
  });
});
