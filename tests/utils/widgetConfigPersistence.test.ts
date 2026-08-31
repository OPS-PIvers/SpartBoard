import { describe, it, expect } from 'vitest';
import {
  APPEARANCE_CONFIG_KEYS,
  mergeWidgetConfig,
  migrateSavedWidgetConfigs,
  pickAppearanceKeys,
  type SavedWidgetConfigMap,
} from '@/utils/widgetConfigPersistence';
import { PII_WIDGET_FIELDS } from '@/utils/dashboardPII';
import type { WidgetConfig } from '@/types';

describe('pickAppearanceKeys', () => {
  it('keeps every allowlisted appearance key', () => {
    const config = {
      fontFamily: 'handwritten',
      fontColor: '#ffffff',
      cardColor: '#1e293b',
      cardOpacity: 0.8,
      textSizePreset: 'large',
      bgColor: '#60a5fa',
      fontSize: 18,
      textColor: '#000000',
      titleColor: '#ad2122',
      scaleMultiplier: 1.5,
      layout: 'cards',
    } as Partial<WidgetConfig>;

    expect(pickAppearanceKeys(config)).toEqual(config);
    expect(Object.keys(config).sort()).toEqual(
      [...APPEARANCE_CONFIG_KEYS].sort()
    );
  });

  it('drops the content keys that leaked across boards', () => {
    const config = {
      items: [{ id: '1', text: 'German II agenda' }],
      urls: [{ id: '1', label: 'Quizlet', url: 'https://example.com' }],
      content: 'notes from another board',
      hotspots: [{ id: 'h1' }],
      savedLibrary: [{ id: 'p1' }],
      fontFamily: 'sans',
    } as Partial<WidgetConfig>;

    const result = pickAppearanceKeys(config);

    expect(result).toEqual({ fontFamily: 'sans' });
    for (const key of [
      'items',
      'urls',
      'content',
      'hotspots',
      'savedLibrary',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('drops student PII without needing it enumerated anywhere', () => {
    const config = Object.fromEntries(
      PII_WIDGET_FIELDS.map((field) => [field, 'student data'])
    ) as Partial<WidgetConfig>;

    expect(pickAppearanceKeys({ ...config, cardColor: '#fff' })).toEqual({
      cardColor: '#fff',
    });
  });

  it('drops an unknown key a future widget invents, with no registration', () => {
    const config = {
      someKeyNobodyHasWrittenYet: 'lesson content',
      fontColor: '#fff',
    } as Partial<WidgetConfig>;

    expect(pickAppearanceKeys(config)).toEqual({ fontColor: '#fff' });
  });

  it('does not reach into nested content — per-card colors travel with their cards', () => {
    const cards = [
      { id: 'c1', text: 'front', bgColor: '#ef4444' },
      { id: 'c2', text: 'back', bgColor: '#22c55e' },
    ];
    const config = { cards, fontFamily: 'mono' } as Partial<WidgetConfig>;

    const result = pickAppearanceKeys(config);

    expect(result).toEqual({ fontFamily: 'mono' });
    expect(cards[0].bgColor).toBe('#ef4444');
  });

  it('returns an empty object for a config with no appearance keys', () => {
    expect(pickAppearanceKeys({ items: [] } as Partial<WidgetConfig>)).toEqual(
      {}
    );
  });

  it('does not mutate the input config', () => {
    const config = {
      items: ['a'],
      fontFamily: 'sans',
    } as Partial<WidgetConfig>;
    const original = { ...config };

    pickAppearanceKeys(config);

    expect(config).toEqual(original);
  });
});

describe('mergeWidgetConfig', () => {
  it('layers defaults < admin < saved < overrides (later wins)', () => {
    const defaults = {
      fontFamily: 'sans',
      fontColor: '#000',
      cardOpacity: 0.5,
    } as Partial<WidgetConfig>;
    const adminConfig = { fontColor: '#111', cardColor: '#fff' } as Record<
      string,
      unknown
    >;
    const saved = { cardOpacity: 0.8 } as Partial<WidgetConfig>;
    const overrides = { fontColor: '#222' } as Partial<WidgetConfig>;

    const result = mergeWidgetConfig(defaults, adminConfig, saved, overrides);

    expect(result).toEqual({
      fontFamily: 'sans',
      fontColor: '#222',
      cardColor: '#fff',
      cardOpacity: 0.8,
    });
  });

  it('filters the saved layer only, leaving defaults and overrides intact', () => {
    const defaults = { items: [] } as Partial<WidgetConfig>;
    const saved = {
      items: [{ id: '1', text: 'German II agenda' }],
      fontFamily: 'mono',
    } as Partial<WidgetConfig>;
    const overrides = {
      items: [{ id: '2', text: 'pasted' }],
    } as Partial<WidgetConfig>;

    expect(mergeWidgetConfig(defaults, undefined, saved, overrides)).toEqual({
      items: [{ id: '2', text: 'pasted' }],
      fontFamily: 'mono',
    });
  });

  it('gives a new widget empty content and inherited styling — the reported bug', () => {
    const defaults = { items: [], urls: [] } as Partial<WidgetConfig>;
    const savedFromAnotherBoard = {
      items: [{ id: '1', text: 'German II agenda' }],
      urls: [{ id: '1', url: 'https://example.com' }],
      fontFamily: 'handwritten',
      cardColor: '#1e293b',
    } as Partial<WidgetConfig>;

    const result = mergeWidgetConfig(
      defaults,
      undefined,
      savedFromAnotherBoard,
      undefined
    ) as Record<string, unknown>;

    expect(result.items).toEqual([]);
    expect(result.urls).toEqual([]);
    expect(result.fontFamily).toBe('handwritten');
    expect(result.cardColor).toBe('#1e293b');
  });

  it('treats undefined layers as empty', () => {
    expect(
      mergeWidgetConfig(undefined, undefined, undefined, undefined)
    ).toEqual({});
  });
});

/** `WidgetConfig` is a union, so `savedLibrary` needs a cast to read generically. */
const readPreset = (
  presets: SavedWidgetConfigMap,
  type: 'stations' | 'hotspot-image'
): unknown =>
  (presets[type] as Record<string, unknown> | undefined)?.savedLibrary;

describe('migrateSavedWidgetConfigs', () => {
  const pollutedProfile = (): SavedWidgetConfigMap =>
    ({
      checklist: {
        items: [{ id: '1', text: 'German II agenda' }],
        firstNames: 'Alice\nBob',
        fontFamily: 'handwritten',
        scaleMultiplier: 1.2,
      },
      url: {
        urls: [{ id: '1', url: 'https://example.com' }],
        cardColor: '#1e293b',
      },
      text: { content: 'leftover note', bgColor: '#60a5fa', fontSize: 18 },
    }) as SavedWidgetConfigMap;

  it('keeps appearance and drops content from a polluted profile', () => {
    const { needsMigration, cleaned } =
      migrateSavedWidgetConfigs(pollutedProfile());

    expect(needsMigration).toBe(true);
    expect(cleaned).toEqual({
      checklist: { fontFamily: 'handwritten', scaleMultiplier: 1.2 },
      url: { cardColor: '#1e293b' },
      text: { bgColor: '#60a5fa', fontSize: 18 },
    });
  });

  it('genuinely removes stale keys rather than shadowing them', () => {
    const { cleaned } = migrateSavedWidgetConfigs(pollutedProfile());

    // A deep-merged write would leave these in place; assert absence, not
    // just that the appearance keys survived.
    expect(cleaned.checklist).not.toHaveProperty('items');
    expect(cleaned.checklist).not.toHaveProperty('firstNames');
    expect(cleaned.url).not.toHaveProperty('urls');
    expect(cleaned.text).not.toHaveProperty('content');
    expect(JSON.stringify(cleaned)).not.toContain('German II agenda');
  });

  it('lifts preset libraries for both widgets that use them', () => {
    const stationsPreset = { id: 'p1', name: 'Lab rotation', stations: [] };
    const hotspotItem = { id: 'h1', name: 'Map', hotspots: [] };

    const { presets, cleaned } = migrateSavedWidgetConfigs({
      stations: {
        savedLibrary: [stationsPreset],
        customRoster: ['Alice'],
        fontFamily: 'sans',
      },
      'hotspot-image': { savedLibrary: [hotspotItem] },
    } as SavedWidgetConfigMap);

    expect(presets).toEqual({
      stations: { savedLibrary: [stationsPreset] },
      'hotspot-image': { savedLibrary: [hotspotItem] },
    });
    expect(cleaned).toEqual({ stations: { fontFamily: 'sans' } });
    expect(cleaned.stations).not.toHaveProperty('savedLibrary');
    expect(cleaned.stations).not.toHaveProperty('customRoster');
  });

  it('does not overwrite presets already saved in the new field', () => {
    const legacy = { id: 'old', name: 'Stale', stations: [] };
    const current = { id: 'new', name: 'Current', stations: [] };

    const { presets } = migrateSavedWidgetConfigs(
      { stations: { savedLibrary: [legacy] } } as SavedWidgetConfigMap,
      { stations: { savedLibrary: [current] } } as SavedWidgetConfigMap
    );

    expect(readPreset(presets, 'stations')).toEqual([current]);
  });

  it('carries unrelated existing presets through untouched', () => {
    const hotspotItem = { id: 'h1', name: 'Map', hotspots: [] };

    const { presets } = migrateSavedWidgetConfigs(
      { checklist: { items: [] } } as SavedWidgetConfigMap,
      {
        'hotspot-image': { savedLibrary: [hotspotItem] },
      } as SavedWidgetConfigMap
    );

    expect(readPreset(presets, 'hotspot-image')).toEqual([hotspotItem]);
  });

  it('reports no migration needed for an already-clean profile', () => {
    const clean = {
      checklist: { fontFamily: 'handwritten', scaleMultiplier: 1.2 },
      text: { bgColor: '#60a5fa' },
    } as SavedWidgetConfigMap;

    const { needsMigration, cleaned, presets } =
      migrateSavedWidgetConfigs(clean);

    expect(needsMigration).toBe(false);
    expect(cleaned).toEqual(clean);
    expect(presets).toEqual({});
  });

  it('is idempotent — re-running on its own output is a no-op', () => {
    const first = migrateSavedWidgetConfigs(pollutedProfile());
    const second = migrateSavedWidgetConfigs(first.cleaned, first.presets);

    expect(second.needsMigration).toBe(false);
    expect(second.cleaned).toEqual(first.cleaned);
    expect(second.presets).toEqual(first.presets);
  });

  it('handles an empty profile and malformed entries without throwing', () => {
    expect(migrateSavedWidgetConfigs({})).toEqual({
      needsMigration: false,
      cleaned: {},
      presets: {},
    });

    const malformed = migrateSavedWidgetConfigs({
      checklist: null,
      url: { cardColor: '#fff' },
    } as unknown as SavedWidgetConfigMap);

    expect(malformed.needsMigration).toBe(true);
    expect(malformed.cleaned).toEqual({ url: { cardColor: '#fff' } });
  });

  it('does not mutate the stored blob it was handed', () => {
    const raw = pollutedProfile();
    const original = JSON.parse(JSON.stringify(raw)) as SavedWidgetConfigMap;

    migrateSavedWidgetConfigs(raw);

    expect(raw).toEqual(original);
  });
});
