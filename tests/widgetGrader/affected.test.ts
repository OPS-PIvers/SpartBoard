import { describe, expect, it } from 'vitest';
import {
  affectedWidgets,
  gateShards,
  registryTypes,
} from '@/scripts/widget-grader/affected';
import type { WidgetFiles } from '@/scripts/widget-grader/widgetFiles';

const widget = (type: string, folder: string | null, entry: string) => ({
  type,
  folder,
  entry,
  frontFace: [entry],
  settings: folder ? [`${folder}/Settings.tsx`] : [],
  other: [],
  tests: [],
  externalTests: [],
  skipScaling: true,
});

const FILES: Record<string, WidgetFiles> = {
  clock: widget(
    'clock',
    'components/widgets/ClockWidget',
    'components/widgets/ClockWidget/Widget.tsx'
  ),
  poll: widget(
    'poll',
    'components/widgets/PollWidget',
    'components/widgets/PollWidget/Widget.tsx'
  ),
  'time-tool': widget(
    'time-tool',
    null,
    'components/widgets/TimeToolWidget.tsx'
  ),
};

describe('affectedWidgets', () => {
  it('maps widget folder and flat entry changes to their types', () => {
    expect(
      affectedWidgets(
        [
          'components/widgets/ClockWidget/parts/Face.tsx',
          'components/widgets/TimeToolWidget.tsx',
          'README.md',
        ],
        FILES
      )
    ).toEqual({ mode: 'some', types: ['clock', 'time-tool'] });
  });

  it('maps a fixture or stub file named for a type to that type', () => {
    expect(
      affectedWidgets(['components/dev/widgetGrader/fixtures/poll.ts'], FILES)
    ).toEqual({ mode: 'some', types: ['poll'] });
  });

  it.each([
    'components/common/DraggableWindow.tsx',
    'components/common/ScaledEmptyState.tsx',
    'config/widgetDefaults.ts',
    'config/widgetEnvelopes.ts',
    'components/dev/widgetGrader/WidgetGraderHarness.tsx',
    'components/dev/widgetGrader/fixtures/index.ts',
    'scripts/widget-grader/measure/analyze.ts',
    'playwright.grader.config.ts',
  ])('runs the full sweep for shared code: %s', (path) => {
    expect(affectedWidgets([path], FILES)).toEqual({
      mode: 'all',
      reason: path,
    });
  });

  it('returns none when no widget is touched', () => {
    expect(affectedWidgets(['functions/src/index.ts'], FILES)).toEqual({
      mode: 'none',
    });
  });

  it('checks only the registry entries a diff touches', () => {
    const diff = [
      '--- a/components/widgets/WidgetRegistry.ts',
      '+++ b/components/widgets/WidgetRegistry.ts',
      "-  poll: lazyNamed(() => import('./PollWidget'), 'PollWidget'),",
      "+  poll: lazyNamed(() => import('./PollWidget/Widget'), 'PollWidget'),",
    ].join('\n');
    expect(
      affectedWidgets(['components/widgets/WidgetRegistry.ts'], FILES, diff)
    ).toEqual({ mode: 'some', types: ['poll'] });
  });

  it('falls back to the full sweep when a registry diff names no type', () => {
    expect(
      affectedWidgets(
        ['components/widgets/WidgetRegistry.ts'],
        FILES,
        '+import { thing } from "./x";'
      ).mode
    ).toBe('all');
  });
});

describe('registryTypes', () => {
  it('reads quoted and bare keys on changed lines only', () => {
    const diff = [
      "+  'time-tool': () => import('./TimeTool/settings.schema'),",
      '   clock: unchanged,',
      '-  clock: removed,',
      '+  notAType: 1,',
    ].join('\n');
    expect(registryTypes(diff, new Set(Object.keys(FILES)))).toEqual([
      'clock',
      'time-tool',
    ]);
  });
});

describe('gateShards', () => {
  it('runs no shard, one shard, or every shard by scope', () => {
    expect(gateShards({ mode: 'none' }, 4)).toEqual([]);
    expect(gateShards({ mode: 'some', types: ['clock'] }, 4)).toEqual([1]);
    expect(gateShards({ mode: 'all', reason: 'config/tools.ts' }, 4)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(gateShards({ mode: 'all', reason: 'config/tools.ts' }, 0)).toEqual([
      1,
    ]);
  });
});
