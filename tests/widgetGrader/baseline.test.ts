import { describe, expect, it } from 'vitest';
import {
  buildBaseline,
  compareBaseline,
  comparisonMarkdown,
  currentFailures,
} from '@/scripts/widget-grader/measure/baseline';
import { chunkBytes } from '@/scripts/widget-grader/measure/chunks';
import type { GateId, Measurement } from '@/scripts/widget-grader/types';

const gate = (type: string, id: GateId, pass: boolean): Measurement => ({
  widgetType: type,
  criterionId: null,
  size: null,
  fixture: null,
  gate: id,
  pass,
  values: pass ? {} : { where: 'default/typical', firstOffenders: 'button' },
});

describe('gate baseline', () => {
  const byWidget = {
    clock: [gate('clock', 'G1', false), gate('clock', 'G3', true)],
    poll: [gate('poll', 'G2', false)],
  };

  it('lists widget-level gate failures only', () => {
    const perRender: Measurement = {
      ...gate('clock', 'G2', false),
      size: { name: 'default', width: 300, height: 200 },
    };
    expect(
      currentFailures({
        ...byWidget,
        clock: [...byWidget.clock, perRender],
      }).map((f) => `${f.type} ${f.gate}`)
    ).toEqual(['clock G1', 'poll G2']);
  });

  it('builds a sorted map of failing gates', () => {
    const b = buildBaseline(
      'run1',
      currentFailures(byWidget),
      new Date('2026-10-05T00:00:00Z')
    );
    expect(b).toEqual({
      runId: 'run1',
      generatedAt: '2026-10-05T00:00:00.000Z',
      failures: { clock: ['G1'], poll: ['G2'] },
    });
  });

  it('reports failures missing from the baseline and baseline entries now passing', () => {
    const baseline = {
      runId: 'r',
      generatedAt: '',
      failures: { clock: ['G1', 'G4'] as GateId[], dice: ['G2'] as GateId[] },
    };
    const c = compareBaseline(baseline, currentFailures(byWidget), [
      'clock',
      'poll',
    ]);
    expect(c.added.map((f) => `${f.type} ${f.gate}`)).toEqual(['poll G2']);
    // dice wasn't measured, so its entry is neither fixed nor new.
    expect(c.fixed).toEqual([{ type: 'clock', gate: 'G4' }]);
    expect(comparisonMarkdown(c)).toContain(
      '- poll G2: at default/typical button'
    );
  });

  it('passes when every failure is already known', () => {
    const baseline = buildBaseline('r', currentFailures(byWidget));
    const c = compareBaseline(baseline, currentFailures(byWidget), [
      'clock',
      'poll',
    ]);
    expect(c).toEqual({ added: [], fixed: [] });
    expect(comparisonMarkdown(c)).toContain('No new gate failures.');
  });
});

describe('chunkBytes', () => {
  it('adds the entry chunk and its CSS', () => {
    const manifest = {
      'components/widgets/ClockWidget/Widget.tsx': {
        file: 'assets/Widget-abc.js',
        css: ['assets/Widget-abc.css'],
      },
    };
    const sizes: Record<string, number> = {
      'assets/Widget-abc.js': 1000,
      'assets/Widget-abc.css': 200,
    };
    expect(
      chunkBytes(
        manifest,
        'components/widgets/ClockWidget/Widget.tsx',
        (f) => sizes[f]
      )
    ).toBe(1200);
    expect(chunkBytes(manifest, 'missing.tsx', () => 1)).toBeNull();
  });
});
