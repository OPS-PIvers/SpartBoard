import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RenderMetrics } from '@/scripts/widget-grader/measure/analyze';
import {
  DRAG_BLOCKING_SELECTOR,
  INTERACTIVE_ELEMENTS_SELECTOR,
  loadThresholds,
} from '@/scripts/widget-grader/measure/constants';
import {
  contrastRatio,
  parseColor,
  worstContrast,
} from '@/scripts/widget-grader/measure/contrast';
import {
  summarize,
  type RenderRecord,
} from '@/scripts/widget-grader/measure/levels';
import {
  gateFailures,
  summaryTable,
} from '@/scripts/widget-grader/measure/summary';
import type { MeasurementSize, SizeName } from '@/scripts/widget-grader/types';

const t = loadThresholds();
const PASS = { pass: true, values: {} };
const FAIL = { pass: false, values: { offenders: 'button' } };

const metrics = (over: Partial<RenderMetrics> = {}): RenderMetrics => ({
  contentFraction: 0.8,
  primaryPx: 48,
  minFontPx: 16,
  textCount: 3,
  minContrast: 7,
  contrastUnder3: 0,
  contrastFailures: 0,
  contrastUnknown: 0,
  controls: 2,
  minTargetPx: 48,
  targetsUnder32: 0,
  targetsUnderDefault: 0,
  minSpacingPx: 12,
  scrollers: 0,
  nestedScroll: false,
  wholeCardScroll: false,
  dragFraction: 0.5,
  stripsCovered: 0,
  toolbarOverlaps: 0,
  ...over,
});

const size = (name: SizeName, w = 400, h = 300): MeasurementSize => ({
  name,
  width: w,
  height: h,
});

const record = (
  name: SizeName,
  over: Partial<RenderRecord> = {},
  m: Partial<RenderMetrics> = {}
): RenderRecord => ({
  size: size(name),
  fixture: 'typical',
  variant: 'base',
  g1: PASS,
  g2: PASS,
  g3: PASS,
  metrics: metrics(m),
  scrollEndGaps: [],
  ...over,
});

const healthy = (): RenderRecord[] => [
  record('envelope-min', {}, { primaryPx: 30 }),
  record('default'),
  record('large-1400x900', {}, { primaryPx: 120 }),
  record('maximized-1920x1080', {}, { primaryPx: 160 }),
  record('widest-aspect'),
  record('tallest-aspect'),
  record('default', { variant: 'selected' }),
];

const widgetLevel = (records: RenderRecord[]) =>
  summarize('demo', records, PASS, t).filter((m) => m.size === null);

const level = (records: RenderRecord[], id: string) =>
  widgetLevel(records).find((m) => m.criterionId === id)?.impliedLevel;

describe('summarize', () => {
  it('gives a healthy widget passing gates and top script levels', () => {
    const out = widgetLevel(healthy());
    expect(out.filter((m) => m.gate).every((m) => m.pass)).toBe(true);
    expect(level(healthy(), 'S5')).toBe(4);
    expect(level(healthy(), 'I1')).toBe(3);
    expect(level(healthy(), 'I2')).toBe(4);
    expect(level(healthy(), 'I7')).toBe(3);
    expect(level(healthy(), 'S1')).toBeNull();
    expect(out.find((m) => m.criterionId === 'S6')?.values.applicable).toBe(
      false
    );
  });

  it('sets S1 to 0 and fails G1 when the minimum size clips a control', () => {
    const records = healthy();
    records[0] = record('envelope-min', { g1: FAIL });
    const out = widgetLevel(records);
    expect(out.find((m) => m.gate === 'G1')?.pass).toBe(false);
    expect(out.find((m) => m.gate === 'G1')?.values.where).toBe(
      'envelope-min/typical'
    );
    expect(level(records, 'S1')).toBe(0);
  });

  it('marks S2 level 1 when content stays small in a big card', () => {
    const records = healthy();
    records[2] = record(
      'large-1400x900',
      {},
      { primaryPx: 50, contentFraction: 0.2 }
    );
    expect(level(records, 'S2')).toBe(1);
  });

  it('grades S5 on the R16 thresholds', () => {
    const small = healthy();
    small[1] = record('default', {}, { primaryPx: 20 });
    expect(level(small, 'S5')).toBe(1);
    const tiny = healthy();
    tiny[1] = record('default', {}, { minFontPx: 12 });
    expect(level(tiny, 'S5')).toBe(2);
  });

  it('grades S6 on nesting and end padding', () => {
    const nested = healthy();
    nested[2] = record(
      'large-1400x900',
      {},
      { scrollers: 2, nestedScroll: true }
    );
    expect(level(nested, 'S6')).toBe(1);
    const flush = healthy();
    flush[2] = record(
      'large-1400x900',
      { scrollEndGaps: [0] },
      { scrollers: 1 }
    );
    expect(level(flush, 'S6')).toBe(2);
    const padded = healthy();
    padded[2] = record(
      'large-1400x900',
      { scrollEndGaps: [16] },
      { scrollers: 1 }
    );
    expect(level(padded, 'S6')).toBe(4);
  });

  it('grades I1 on drag fraction and covered strips', () => {
    const covered = healthy();
    covered[1] = record('default', {}, { stripsCovered: 1 });
    expect(level(covered, 'I1')).toBe(1);
    const open = healthy();
    open[1] = record('default', {}, { dragFraction: 0.9 });
    expect(level(open, 'I1')).toBe(4);
  });

  it('grades I2 on target sizes and marks it n/a without controls', () => {
    const small = healthy();
    small[1] = record('default', {}, { targetsUnderDefault: 1 });
    expect(level(small, 'I2')).toBe(2);
    const none = healthy().map((r) => ({
      ...r,
      metrics: metrics({ controls: 0 }),
    }));
    expect(
      widgetLevel(none).find((m) => m.criterionId === 'I2')?.values.applicable
    ).toBe(false);
  });

  it('leaves I7 to the judge when the toolbar covers a control at default size', () => {
    const records = healthy();
    records[6] = record(
      'default',
      { variant: 'selected' },
      { toolbarOverlaps: 1 }
    );
    expect(level(records, 'I7')).toBeNull();
    records[6] = record(
      'large-1400x900',
      { variant: 'selected' },
      { toolbarOverlaps: 1 }
    );
    expect(level(records, 'I7')).toBe(2);
  });

  it('builds the summary table and gate failure lines', () => {
    const records = healthy();
    records[0] = record('envelope-min', { g2: FAIL });
    const byWidget = { demo: summarize('demo', records, PASS, t) };
    expect(summaryTable(byWidget)).toContain(
      '| demo | pass | FAIL | pass | pass | 0 |'
    );
    expect(gateFailures(byWidget)).toEqual([
      'demo G2 at envelope-min/typical: button',
    ]);
  });
});

describe('contrast', () => {
  it('parses rgb and rgba colours', () => {
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 0.5,
    });
    expect(parseColor('transparent')).toBeNull();
  });

  it('computes WCAG ratios', () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
  });

  it('takes the worst gradient stop behind translucent glass', () => {
    const layers = [
      { color: 'rgba(255, 255, 255, 0.8)', image: null },
      {
        color: 'rgba(0, 0, 0, 0)',
        image: 'linear-gradient(rgb(15, 23, 42), rgb(255, 255, 255))',
      },
    ];
    const ratio = worstContrast('rgb(15, 23, 42)', layers) ?? 0;
    const overWhite =
      worstContrast('rgb(15, 23, 42)', [
        { color: 'rgb(255, 255, 255)', image: null },
      ]) ?? 0;
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(overWhite);
  });

  it('is unknown over an image', () => {
    expect(
      worstContrast('rgb(0, 0, 0)', [
        { color: 'rgba(0, 0, 0, 0)', image: 'url("a.png")' },
      ])
    ).toBeNull();
  });
});

describe('selectors copied from DraggableWindow', () => {
  const source = readFileSync('components/common/DraggableWindow.tsx', 'utf8');

  it('match the interactive and drag-blocking selectors', () => {
    const interactive =
      /const INTERACTIVE_ELEMENTS_SELECTOR =\s*'([^']+)'/.exec(source)?.[1];
    expect(interactive).toBe(INTERACTIVE_ELEMENTS_SELECTOR);
    expect(source).toContain(
      'const DRAG_BLOCKING_SELECTOR = `${INTERACTIVE_ELEMENTS_SELECTOR}, .resize-handle, [draggable="true"], [data-no-drag="true"]`'
    );
    expect(DRAG_BLOCKING_SELECTOR).toBe(
      `${INTERACTIVE_ELEMENTS_SELECTOR}, .resize-handle, [draggable="true"], [data-no-drag="true"]`
    );
  });
});

describe('partial coverage', () => {
  it('marks widgets whose fixtures show only part of the widget', () => {
    const byWidget = { music: summarize('music', healthy(), PASS, t) };
    expect(
      byWidget.music.find((m) => m.size === null && m.criterionId === 'S5')
        ?.values.partial
    ).toBeTruthy();
    expect(summaryTable(byWidget)).toContain('| music (partial) |');
  });
});
