import { describe, it, expect } from 'vitest';
import type { WidgetData } from '@/types';
import { migrateBoardWidgets, migrateWidget } from '@/utils/migration';
import { migrateSavedWidgetConfigs } from '@/utils/widgetConfigPersistence';
import sharedFixture from '@/tests/fixtures/boards/shared.json';
import driveFixture from '@/tests/fixtures/boards/drive.json';
import starterPackFixture from '@/tests/fixtures/boards/starterPack.json';
import templateFixture from '@/tests/fixtures/boards/template.json';
import savedConfigsFixture from '@/tests/fixtures/boards/savedConfigs.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Every board load path now runs migrateBoardWidgets. The output must equal the
// fixture with ONLY these deltas applied, so any other change fails the suite.
describe('board load-path characterization', () => {
  it('shared board: configVersion stamped, extra flipped flags cleared', () => {
    const input = clone(sharedFixture.widgets) as unknown as WidgetData[];
    const expected = clone(input).map((w) => ({
      ...w,
      configVersion: 0,
      // w2 has the highest z among flipped widgets, so it keeps flipped.
      ...(w.id === 'w1' ? { flipped: false } : {}),
    }));

    expect(migrateBoardWidgets(input)).toEqual(expected);
  });

  it('drive board: legacy timer rewritten to time-tool, configVersion stamped', () => {
    const input = clone(driveFixture.widgets) as unknown as WidgetData[];
    const out = migrateBoardWidgets(input);

    const expected = clone(input).map((w) =>
      w.id === 'd1'
        ? {
            ...w,
            type: 'time-tool',
            configVersion: 0,
            config: {
              mode: 'timer',
              visualType: 'digital',
              duration: 300,
              elapsedTime: 300,
              isRunning: false,
              selectedSound: 'Gong',
              themeColor: '#2d3f89',
              glow: false,
              fontFamily: 'font-sans',
              clockStyle: 'modern',
            },
          }
        : { ...w, configVersion: 0 }
    );

    expect(out).toEqual(expected);
  });

  it('starter pack: workSymbols rewritten to expectations, configVersion stamped', () => {
    const input = (
      clone(starterPackFixture.widgets) as unknown as WidgetData[]
    ).map((w, i) => ({ ...w, id: `pack-w${i}` }));

    const expected = clone(input).map((w) => ({
      ...w,
      configVersion: 0,
      ...((w.type as string) === 'workSymbols' ? { type: 'expectations' } : {}),
    }));

    expect(migrateBoardWidgets(input)).toEqual(expected);
  });

  it('board template: configVersion stamped, extra flipped flags cleared', () => {
    const input = clone(
      templateFixture.board.widgets
    ) as unknown as WidgetData[];
    const expected = clone(input).map((w) => ({
      ...w,
      configVersion: 0,
      ...(w.id === 't1' ? { flipped: false } : {}),
    }));

    expect(migrateBoardWidgets(input)).toEqual(expected);
  });

  it('collection template: configVersion stamped, nothing else changes', () => {
    const input = clone(
      templateFixture.collection.boards[0].widgets
    ) as unknown as WidgetData[];
    const expected = clone(input).map((w) => ({ ...w, configVersion: 0 }));

    expect(migrateBoardWidgets(input)).toEqual(expected);
  });

  it('saved widget configs: appearance keys survive, content keys are dropped', () => {
    const { cleaned, needsMigration } = migrateSavedWidgetConfigs(
      clone(savedConfigsFixture)
    );

    expect(needsMigration).toBe(true);
    expect(cleaned).toEqual({
      clock: { fontFamily: 'font-sans', fontColor: '#ffffff' },
      checklist: { scaleMultiplier: 1.2 },
    });
  });

  it('is idempotent: running the pipeline twice equals running it once', () => {
    for (const widgets of [
      sharedFixture.widgets,
      driveFixture.widgets,
      templateFixture.board.widgets,
    ]) {
      const once = migrateBoardWidgets(
        clone(widgets) as unknown as WidgetData[]
      );
      expect(migrateBoardWidgets(clone(once))).toEqual(once);
      expect(once.map((w) => migrateWidget(w))).toEqual(once);
    }
  });
});
