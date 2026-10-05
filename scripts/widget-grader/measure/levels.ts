// Per-widget roll-up: render records in, Measurement[] with implied levels out.

import type {
  CriterionId,
  FixtureName,
  GateId,
  Level,
  Measurement,
  MeasurementSize,
  SizeName,
} from '../types';
import type { Check, RenderMetrics, Values } from './analyze';
import {
  MIN_TARGET_SPACING_PX,
  PARTIAL_COVERAGE,
  type Thresholds,
} from './constants';

export type RenderVariant = 'base' | 'selected' | 'settings' | 'lifecycle';

export interface RenderRecord {
  size: MeasurementSize;
  fixture: FixtureName;
  variant: RenderVariant;
  g1?: Check;
  g2?: Check;
  g3: Check;
  metrics?: RenderMetrics;
  /** Gaps under the last item of each panel-sized scroller (tests/e2e/helpers/scrollEndPadding.ts). */
  scrollEndGaps?: number[];
  screenshot?: string;
}

// Primary content that grows less than this between sizes is "staying at its default size".
const NO_GROWTH = 1.15;
const SPARSE_FRACTION = 0.5;
const DEAD_BAND = 0.6;
const SCROLL_END_GAP_PX = 12;

const round = (n: number): number => Math.round(n * 100) / 100;

// Smallest positive value, or -1 when there is none.
const smallest = (values: number[]): number => {
  const positive = values.filter((v) => v > 0);
  return positive.length ? round(Math.min(...positive)) : -1;
};

const metricValues = (m: RenderMetrics): Values => {
  const out: Values = {};
  for (const [k, v] of Object.entries(m))
    out[k] = typeof v === 'number' ? round(v) : v;
  return out;
};

const where = (r: RenderRecord): string =>
  `${r.size.name}/${r.fixture}${r.variant === 'base' ? '' : `/${r.variant}`}`;

const bySize = (
  records: RenderRecord[],
  name: SizeName,
  fixture?: FixtureName
) =>
  records.filter(
    (r) =>
      r.variant === 'base' &&
      r.size.name === name &&
      (!fixture || r.fixture === fixture) &&
      r.metrics
  );

const first = (records: RenderRecord[], name: SizeName, fixture: FixtureName) =>
  bySize(records, name, fixture)[0]?.metrics;

interface Implied {
  level: Level | null;
  values: Values;
}

const s1 = (records: RenderRecord[]): Implied => {
  const mins = bySize(records, 'envelope-min');
  const failed = mins.filter(
    (r) => r.g1?.pass === false || r.g2?.pass === false
  );
  return {
    level: failed.length ? 0 : null,
    values: {
      gateFailuresAtMin: failed.map(where).join(', '),
      minTargetPx: smallest(mins.map((r) => r.metrics!.minTargetPx)),
      minFontPx: smallest(mins.map((r) => r.metrics!.minFontPx)),
    },
  };
};

const grows = (records: RenderRecord[], name: SizeName): Implied => {
  const base = first(records, 'default', 'typical');
  const big = first(records, name, 'typical');
  if (!base || !big) return { level: null, values: { measured: false } };
  const growth = base.primaryPx > 0 ? big.primaryPx / base.primaryPx : 0;
  return {
    level:
      growth < NO_GROWTH && big.contentFraction < SPARSE_FRACTION ? 1 : null,
    values: {
      primaryGrowth: round(growth),
      contentFraction: round(big.contentFraction),
      primaryPx: round(big.primaryPx),
    },
  };
};

const s3 = (records: RenderRecord[]): Implied => {
  const ends = ['widest-aspect', 'tallest-aspect'] as const;
  const bands = ends.map((n) => {
    const m = first(records, n, 'typical');
    return m ? 1 - m.contentFraction : 0;
  });
  const worst = Math.max(...bands);
  return {
    level: worst > DEAD_BAND ? 1 : null,
    values: {
      deadBandWidest: round(bands[0]),
      deadBandTallest: round(bands[1]),
    },
  };
};

const s5 = (records: RenderRecord[], t: Thresholds): Implied => {
  const defaults = bySize(records, 'default').map((r) => r.metrics!);
  const typical = first(records, 'default', 'typical');
  if (!typical || defaults.length === 0)
    return { level: null, values: { measured: false } };
  const minFont = Math.min(...defaults.map((m) => m.minFontPx || Infinity));
  const under3 = defaults.reduce((n, m) => n + m.contrastUnder3, 0);
  const failures = defaults.reduce((n, m) => n + m.contrastFailures, 0);
  const minContrast = Math.min(
    ...defaults.map((m) => m.minContrast || Infinity)
  );
  const meets = (ms: RenderMetrics[], primary: number) =>
    primary >= t.primaryContentMinPx &&
    ms.every(
      (m) =>
        m.contrastFailures === 0 &&
        (m.textCount === 0 || m.minFontPx >= t.readableTextMinPx)
    );
  let level: Level;
  if (typical.primaryPx < t.primaryContentMinPx || under3 > 0) level = 1;
  else if (
    (Number.isFinite(minFont) && minFont < t.readableTextMinPx) ||
    failures > 0
  )
    level = 2;
  else level = 3;
  const minTypical = first(records, 'envelope-min', 'typical');
  const mins = bySize(records, 'envelope-min').map((r) => r.metrics!);
  if (
    level === 3 &&
    minTypical &&
    typical.primaryPx >= 36 &&
    meets(mins, minTypical.primaryPx)
  )
    level = 4;
  return {
    level,
    values: {
      primaryPx: round(typical.primaryPx),
      minFontPx: Number.isFinite(minFont) ? round(minFont) : 0,
      minContrast: Number.isFinite(minContrast) ? round(minContrast) : 0,
      contrastFailures: failures,
      contrastUnknown: defaults.reduce((n, m) => n + m.contrastUnknown, 0),
    },
  };
};

const s6 = (records: RenderRecord[]): Implied => {
  const base = records.filter((r) => r.variant === 'base' && r.metrics);
  const scrolling = base.filter((r) => r.metrics!.scrollers > 0);
  if (scrolling.length === 0)
    return { level: null, values: { applicable: false } };
  const nested = scrolling.filter(
    (r) => r.metrics!.nestedScroll || r.metrics!.wholeCardScroll
  );
  const gaps = scrolling.flatMap((r) => r.scrollEndGaps ?? []);
  const minGap = gaps.length ? Math.min(...gaps) : null;
  const typicalDefault = first(records, 'default', 'typical');
  let level: Level;
  if (nested.length) level = 1;
  else if (minGap !== null && minGap < SCROLL_END_GAP_PX) level = 2;
  else level = typicalDefault && typicalDefault.scrollers === 0 ? 4 : 3;
  return {
    level,
    values: {
      applicable: true,
      scrollingRenders: scrolling.length,
      nestedOrWholeCard: nested.map(where).join(', '),
      minEndGapPx: minGap ?? -1,
    },
  };
};

const i1 = (records: RenderRecord[]): Implied => {
  const m = first(records, 'default', 'typical');
  if (!m) return { level: null, values: { measured: false } };
  const f = m.dragFraction;
  let level: Level;
  if (f < 0.15 || m.stripsCovered > 0) level = 1;
  else if (f < 0.35) level = 2;
  else if (f <= 0.6) level = 3;
  else level = 4;
  return {
    level,
    values: { dragFraction: round(f), stripsCovered: m.stripsCovered },
  };
};

const i2 = (records: RenderRecord[]): Implied => {
  const defaults = bySize(records, 'default').map((r) => r.metrics!);
  const mins = bySize(records, 'envelope-min').map((r) => r.metrics!);
  const total = defaults.reduce((n, m) => n + m.controls, 0);
  if (total === 0) return { level: null, values: { applicable: false } };
  const under32 = defaults.reduce((n, m) => n + m.targetsUnder32, 0);
  const underDefault = defaults.reduce((n, m) => n + m.targetsUnderDefault, 0);
  const minUnder32 = mins.reduce((n, m) => n + m.targetsUnder32, 0);
  const spacings = defaults.map((m) => m.minSpacingPx).filter((v) => v >= 0);
  const minSpacing = spacings.length ? Math.min(...spacings) : -1;
  let level: Level;
  if (under32 / total > 0.5) level = 1;
  else if (underDefault > 0 || minUnder32 > 0) level = 2;
  else level = minSpacing < 0 || minSpacing >= MIN_TARGET_SPACING_PX ? 4 : 3;
  return {
    level,
    values: {
      applicable: true,
      controlsAtDefault: total,
      under32AtDefault: under32,
      under44AtDefault: underDefault,
      under32AtMin: minUnder32,
      minSpacingPx: round(minSpacing),
    },
  };
};

const i7 = (records: RenderRecord[]): Implied => {
  const selected = records.filter((r) => r.variant === 'selected' && r.metrics);
  if (selected.length === 0)
    return { level: null, values: { measured: false } };
  const overlapping = selected.filter((r) => r.metrics!.toolbarOverlaps > 0);
  const atDefault = overlapping.some((r) => r.size.name === 'default');
  return {
    level: overlapping.length === 0 ? 3 : atDefault ? null : 2,
    values: { overlaps: overlapping.map(where).join(', ') },
  };
};

const gateFrom = (
  records: RenderRecord[],
  pick: (r: RenderRecord) => Check | undefined
): { pass: boolean; values: Values } => {
  const failed = records.filter((r) => pick(r)?.pass === false);
  return {
    pass: failed.length === 0,
    values: {
      renders: records.filter((r) => pick(r)).length,
      failedRenders: failed.length,
      where: failed.map(where).slice(0, 8).join(', '),
      firstOffenders: String(
        failed[0] ? pick(failed[0])!.values.offenders : ''
      ),
    },
  };
};

const PER_RENDER: Partial<Record<CriterionId, (r: RenderRecord) => boolean>> = {
  S1: (r) => r.variant === 'base' && r.size.name === 'envelope-min',
  S2: (r) => r.variant === 'base' && r.size.name === 'large-1400x900',
  S3: (r) =>
    r.variant === 'base' &&
    (r.size.name === 'widest-aspect' || r.size.name === 'tallest-aspect'),
  S5: (r) =>
    r.variant === 'base' &&
    (r.size.name === 'default' || r.size.name === 'envelope-min'),
  S6: (r) => r.variant === 'base' && (r.metrics?.scrollers ?? 0) > 0,
  S8: (r) => r.variant === 'base' && r.size.name === 'maximized-1920x1080',
  I1: (r) => r.variant === 'base' && r.size.name === 'default',
  I2: (r) =>
    r.variant === 'base' &&
    (r.size.name === 'default' || r.size.name === 'envelope-min'),
  I7: (r) => r.variant === 'selected',
};

export function summarize(
  widgetType: string,
  records: RenderRecord[],
  g4: Check | null,
  t: Thresholds
): Measurement[] {
  const out: Measurement[] = [];
  for (const r of records) {
    const shot: Values = r.screenshot ? { screenshot: r.screenshot } : {};
    const gates: [GateId, Check | undefined][] = [
      ['G1', r.g1],
      ['G2', r.g2],
      ['G3', r.g3],
    ];
    for (const [gate, check] of gates) {
      if (!check) continue;
      out.push({
        widgetType,
        criterionId: null,
        size: r.size,
        fixture: r.fixture,
        gate,
        pass: check.pass,
        values: { variant: r.variant, ...check.values, ...shot },
      });
    }
    if (!r.metrics) continue;
    for (const [id, applies] of Object.entries(PER_RENDER) as [
      CriterionId,
      (x: RenderRecord) => boolean,
    ][]) {
      if (!applies(r)) continue;
      out.push({
        widgetType,
        criterionId: id,
        size: r.size,
        fixture: r.fixture,
        values: {
          variant: r.variant,
          ...metricValues(r.metrics),
          ...(id === 'S6'
            ? { scrollEndGaps: (r.scrollEndGaps ?? []).join(',') }
            : {}),
          ...shot,
        },
      });
    }
  }
  const surface = records.filter((r) => r.variant === 'base');
  const gates: [GateId, { pass: boolean; values: Values }][] = [
    ['G1', gateFrom(surface, (r) => r.g1)],
    ['G2', gateFrom(surface, (r) => r.g2)],
    ['G3', gateFrom(records, (r) => r.g3)],
  ];
  if (g4) gates.push(['G4', { pass: g4.pass, values: g4.values }]);
  const partial: Values = PARTIAL_COVERAGE[widgetType]
    ? { partial: PARTIAL_COVERAGE[widgetType] }
    : {};
  for (const [gate, result] of gates)
    out.push({
      widgetType,
      criterionId: null,
      size: null,
      fixture: null,
      gate,
      pass: result.pass,
      values: { ...result.values, ...partial },
    });
  const implied: [CriterionId, Implied][] = [
    ['S1', s1(records)],
    ['S2', grows(records, 'large-1400x900')],
    ['S3', s3(records)],
    ['S5', s5(records, t)],
    ['S6', s6(records)],
    ['S8', grows(records, 'maximized-1920x1080')],
    ['I1', i1(records)],
    ['I2', i2(records)],
    ['I7', i7(records)],
  ];
  for (const [criterionId, { level, values }] of implied)
    out.push({
      widgetType,
      criterionId,
      size: null,
      fixture: null,
      values: { ...values, ...partial },
      impliedLevel: level,
    });
  return out;
}
