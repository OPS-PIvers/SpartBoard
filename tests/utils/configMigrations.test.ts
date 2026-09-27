import { describe, it, expect } from 'vitest';
import type { WidgetConfig, WidgetData, WidgetType } from '@/types';
import {
  WIDGET_CONFIG_MIGRATIONS,
  deleteKeyStep,
  migrateWidget,
  normalizeFlipped,
  renameKeyStep,
  targetConfigVersion,
} from '@/utils/migration';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';

const widget = (over: Partial<WidgetData>): WidgetData =>
  ({
    id: 'w',
    type: 'clock',
    x: 0,
    y: 0,
    w: 300,
    h: 200,
    z: 1,
    config: {},
    ...over,
  }) as WidgetData;

describe('WIDGET_CONFIG_MIGRATIONS', () => {
  it('is empty in wave 1b — no widget migrates yet', () => {
    expect(Object.keys(WIDGET_CONFIG_MIGRATIONS)).toEqual([]);
  });

  it('target version is the step-table length', () => {
    expect(targetConfigVersion('clock')).toBe(0);
  });

  // ~60 sequential dynamic imports; can exceed vitest's 5000ms default under CPU contention (measured).
  it('every schema configVersion matches its migration-table length', async () => {
    for (const [type, load] of Object.entries(WIDGET_SETTINGS_SCHEMAS)) {
      if (!load) continue;
      const schema = await load();
      expect(schema.configVersion ?? 0).toBe(
        targetConfigVersion(type as WidgetType)
      );
    }
  }, 20000);

  it('stamps configVersion and is idempotent', () => {
    const once = migrateWidget(widget({}));
    expect(once.configVersion).toBe(0);
    expect(migrateWidget(once)).toEqual(once);
  });

  it('leaves a stamp written by a newer bundle alone', () => {
    const w = widget({ configVersion: 3 });
    expect(migrateWidget(w).configVersion).toBe(3);
  });
});

describe('normalizeFlipped', () => {
  const flip = (id: string, z: number, flipped?: boolean) =>
    widget({ id, z, flipped });

  it('returns the same array reference when nothing changes', () => {
    const widgets = [flip('a', 1, true), flip('b', 2)];
    expect(normalizeFlipped(widgets)).toBe(widgets);
  });

  it('keeps only the highest-z flipped widget', () => {
    const out = normalizeFlipped([
      flip('a', 1, true),
      flip('b', 9, true),
      flip('c', 4, true),
    ]);
    expect(out.map((w) => w.flipped)).toEqual([false, true, false]);
  });

  it('breaks a z tie in favour of the first widget in the array', () => {
    const out = normalizeFlipped([flip('a', 5, true), flip('b', 5, true)]);
    expect(out.map((w) => w.flipped)).toEqual([true, false]);
  });
});

describe('renameKeyStep / deleteKeyStep', () => {
  const rename = renameKeyStep('oldKey', 'newKey');
  const remove = deleteKeyStep('oldKey', 'newKey');

  it('rename copies old to new and keeps old (dual-write)', () => {
    const out = rename({ oldKey: 7 } as unknown as WidgetConfig);
    expect(out).toEqual({ oldKey: 7, newKey: 7 });
  });

  it('rename does not clobber an existing new key', () => {
    const input = { oldKey: 7, newKey: 9 } as unknown as WidgetConfig;
    expect(rename(input)).toBe(input);
  });

  it('delete step self-heals an old-shape config carrying a wrong stamp', () => {
    // configVersion said the rename ran, but only the old key is present.
    const out = remove({ oldKey: 7 } as unknown as WidgetConfig);
    expect(out).toEqual({ newKey: 7 });
  });

  it('delete step drops old once new is already present', () => {
    const out = remove({ oldKey: 7, newKey: 9 } as unknown as WidgetConfig);
    expect(out).toEqual({ newKey: 9 });
  });
});
