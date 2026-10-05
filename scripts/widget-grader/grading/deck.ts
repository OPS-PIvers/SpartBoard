// Builds the grading deck (one card per criterion per widget) from measurer, static scan and judge output.

import type {
  ApplicabilityKind,
  Criterion,
  CriterionId,
  Dimension,
  FixtureName,
  GateId,
  Level,
  Measurement,
  Rubric,
  Scorecard,
  SizeName,
} from '../types.ts';
import type {
  ApplicabilityFacts,
  DeckCard,
  DeckGate,
  DeckShot,
  GradingDeck,
  GradingMode,
  JudgeScore,
} from './types.ts';

export interface WidgetInput {
  type: string;
  name: string;
  /** Measurer and static scanner output for this widget. */
  measurements: Measurement[];
  hasSettings: boolean;
  scorecard?: Scorecard;
  judge?: Partial<Record<CriterionId, JudgeScore>>;
}

export interface DeckOptions {
  rubric: Rubric;
  mode: GradingMode;
  widgets: WidgetInput[];
  /** Criterion mode: the one criterion to grade across widgets. */
  criterion?: CriterionId;
  /** Exemplar widget per criterion and level, from docs/widget-rubric/calibration/exemplars.json. */
  exemplars?: Partial<Record<CriterionId, Partial<Record<`${Level}`, string>>>>;
  deckId: string;
  runId: string;
  createdAt: string;
  harnessOrigin?: string;
  /** Spot check (R33): only these widget/criterion pairs, as "type:criterion". */
  only?: string[];
}

const MAX_SHOTS = 6;
const EXEMPLAR_CRITERIA: CriterionId[] = ['V1', 'V2', 'V3'];
const FEEL_TEST: CriterionId[] = ['I1', 'I3', 'C6'];

// The measurement whose boolean `applicable` value answers each applicability rule.
const FACT_SOURCE: Partial<Record<ApplicabilityKind, CriterionId>> = {
  scrollableContent: 'S6',
  hasControls: 'I2',
  animates: 'I5',
  holdsTeacherContent: 'R2',
  showsRosterData: 'R4',
};

const implied = (ms: Measurement[], id: CriterionId): Measurement | undefined =>
  ms.find((m) => m.criterionId === id && m.size === null && !m.gate);

export function applicabilityFacts(w: WidgetInput): ApplicabilityFacts {
  const facts = {
    all: true,
    hasSettings: w.hasSettings,
  } as ApplicabilityFacts;
  for (const [kind, source] of Object.entries(FACT_SOURCE) as [
    ApplicabilityKind,
    CriterionId,
  ][]) {
    const v = implied(w.measurements, source)?.values.applicable;
    facts[kind] = typeof v === 'boolean' ? v : null;
  }
  return facts;
}

/** N/A only when the rule's fact is known to be false (R15); an unmeasured fact keeps the criterion graded. */
export const isNotApplicable = (
  c: Criterion,
  facts: ApplicabilityFacts
): boolean => facts[c.applicability.applies] === false;

const LABELS: Record<string, [string, string?]> = {
  gateFailuresAtMin: ['Gate failures at minimum size'],
  minTargetPx: ['Smallest tap target', 'px'],
  minFontPx: ['Smallest text', 'px'],
  primaryGrowth: ['Primary content growth from default', '×'],
  contentFraction: ['Card filled by content', '%'],
  primaryPx: ['Primary content size', 'px'],
  deadBandWidest: ['Empty area at widest aspect', '%'],
  deadBandTallest: ['Empty area at tallest aspect', '%'],
  minContrast: ['Lowest text contrast', ':1'],
  contrastFailures: ['Text under contrast threshold'],
  contrastUnknown: ['Text with unmeasured contrast'],
  scrollingRenders: ['Renders that scroll'],
  nestedOrWholeCard: ['Nested or whole-card scrolling'],
  minEndGapPx: ['Smallest end padding', 'px'],
  dragFraction: ['Card that starts a drag', '%'],
  stripsCovered: ['Edge strips covered'],
  controlsAtDefault: ['Controls at default size'],
  under32AtDefault: ['Targets under 32 px at default size'],
  under44AtDefault: ['Targets under 44 px at default size'],
  under32AtMin: ['Targets under 32 px at minimum size'],
  minSpacingPx: ['Smallest gap between targets', 'px'],
  overlaps: ['Toolbar overlaps'],
  partial: ['Partial coverage'],
};

const SKIP_KEYS = new Set(['applicable', 'measured', 'levelCeiling']);
const PERCENT = new Set([
  'contentFraction',
  'deadBandWidest',
  'deadBandTallest',
  'dragFraction',
]);

const humanize = (key: string): string => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** One plain-words line per measured value, e.g. "Smallest tap target: 28 px". */
export function plainWords(values: Measurement['values']): string[] {
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    if (SKIP_KEYS.has(key) || raw === '' || key === 'screenshot') continue;
    const [label, unit] = LABELS[key] ?? [humanize(key)];
    let value: string;
    if (typeof raw === 'boolean') value = raw ? 'yes' : 'no';
    else if (typeof raw === 'number' && raw === -1) value = 'none';
    else if (typeof raw === 'number' && PERCENT.has(key))
      value = `${Math.round(raw * 100)}%`;
    else if (unit === 'px') value = `${raw} px`;
    else value = unit && unit !== '%' ? `${raw}${unit}` : String(raw);
    lines.push(`${label}: ${value}`);
  }
  return lines;
}

interface ShotKey {
  size: SizeName;
  fixture: FixtureName;
  variant: string;
}

const SIZE_LABEL: Record<SizeName, string> = {
  'envelope-min': 'Minimum',
  default: 'Default',
  'large-1400x900': 'Large',
  'maximized-1920x1080': 'Maximized',
  'widest-aspect': 'Widest',
  'tallest-aspect': 'Tallest',
};

const VARIANT_LABEL: Record<string, string> = {
  selected: 'selected',
  settings: 'settings open',
};

const ALL_FIXTURES: FixtureName[] = ['empty', 'typical', 'stress'];
const ALL_SIZES = Object.keys(SIZE_LABEL) as SizeName[];

const pick = (
  sizes: SizeName[],
  fixtures: FixtureName[],
  variant = 'base'
): ShotKey[] =>
  sizes.flatMap((size) =>
    fixtures.map((fixture) => ({ size, fixture, variant }))
  );

const DEFAULT_TYPICAL = pick(['default'], ['typical']);

const SHOT_PICKS: Partial<Record<CriterionId, ShotKey[]>> = {
  S1: pick(['envelope-min'], ALL_FIXTURES),
  S2: [...DEFAULT_TYPICAL, ...pick(['large-1400x900'], ['typical', 'stress'])],
  S3: pick(['widest-aspect', 'tallest-aspect'], ['typical', 'stress']),
  S5: pick(['default'], ALL_FIXTURES),
  S7: pick(['envelope-min', 'default'], ['typical']),
  S8: pick(['maximized-1920x1080'], ALL_FIXTURES),
  I7: pick(ALL_SIZES, ['typical'], 'selected'),
  V2: pick(['default'], ['typical', 'stress']),
  C2: pick(['default'], ['typical'], 'settings'),
  C3: pick(['default'], ['empty']),
  C4: pick(['default'], ['typical'], 'settings'),
  C5: pick(['default'], ['empty']),
  C6: pick(['default'], ['typical'], 'settings'),
  R1: pick(['default'], ['empty', 'typical']),
};

interface ShotRecord {
  path: string;
  size: { name: SizeName; width: number; height: number };
  fixture: FixtureName;
  variant: string;
}

const shotIndex = (ms: Measurement[]): ShotRecord[] => {
  const seen = new Map<string, ShotRecord>();
  for (const m of ms) {
    const path = m.values.screenshot;
    if (typeof path !== 'string' || !m.size || !m.fixture) continue;
    if (!seen.has(path))
      seen.set(path, {
        path,
        size: m.size,
        fixture: m.fixture,
        variant: String(m.values.variant ?? 'base'),
      });
  }
  return [...seen.values()];
};

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;

const toShot = (type: string, r: ShotRecord): DeckShot => {
  const variant = VARIANT_LABEL[r.variant];
  return {
    src: `shots/${type}/${basename(r.path)}`,
    from: r.path,
    caption: `${SIZE_LABEL[r.size.name]} ${r.size.width}×${r.size.height}, ${r.fixture}${variant ? `, ${variant}` : ''}`,
  };
};

export function shotsFor(
  type: string,
  id: CriterionId,
  ms: Measurement[]
): DeckShot[] {
  const index = shotIndex(ms);
  let records: ShotRecord[];
  if (id === 'S6') {
    // The renders that actually scroll.
    records = ms
      .filter((m) => m.criterionId === 'S6' && m.size && m.values.screenshot)
      .map((m) => index.find((r) => r.path === m.values.screenshot))
      .filter((r): r is ShotRecord => Boolean(r));
  } else {
    const keys = SHOT_PICKS[id] ?? DEFAULT_TYPICAL;
    records = keys
      .map((k) =>
        index.find(
          (r) =>
            r.size.name === k.size &&
            r.fixture === k.fixture &&
            r.variant === k.variant
        )
      )
      .filter((r): r is ShotRecord => Boolean(r));
  }
  return records.slice(0, MAX_SHOTS).map((r) => toShot(type, r));
}

export function harnessPath(
  type: string,
  w: number,
  h: number,
  fixture: FixtureName,
  settingsOpen = false
): string {
  const params = new URLSearchParams({
    type,
    fixture,
    w: String(w),
    h: String(h),
  });
  if (settingsOpen) params.set('settings', 'open');
  return `/widget-grader-dev?${params.toString()}`;
}

const harnessLinks = (
  type: string,
  id: CriterionId,
  ms: Measurement[]
): DeckCard['harness'] => {
  if (!FEEL_TEST.includes(id)) return [];
  const def = shotIndex(ms).find((r) => r.size.name === 'default');
  if (!def) return [];
  const { width, height } = def.size;
  return [
    {
      label: 'Default, typical',
      path: harnessPath(type, width, height, 'typical', id === 'C6'),
    },
  ];
};

const levelsOf = (c: Criterion): DeckCard['levels'] =>
  (['0', '1', '2', '3', '4'] as const)
    .filter((k) => c.descriptors[k])
    .map((k) => ({ level: Number(k) as Level, text: c.descriptors[k]! }));

export function gatesOf(ms: Measurement[]): DeckGate[] {
  return ms
    .filter((m) => m.gate && m.size === null)
    .map((m) => ({
      gate: m.gate as GateId,
      pass: m.pass !== false,
      where: String(m.values.where ?? ''),
    }));
}

export function buildCard(
  dim: Dimension,
  c: Criterion,
  w: WidgetInput,
  facts: ApplicabilityFacts,
  exemplars: DeckOptions['exemplars'],
  shotWidgets: Map<string, Measurement[]>
): DeckCard {
  const m = implied(w.measurements, c.id);
  const prior = w.scorecard?.criteria[c.id];
  const exemplarFor = exemplars?.[c.id] ?? {};
  return {
    id: `${w.type}__${c.id}`,
    widgetType: w.type,
    widgetName: w.name,
    criterionId: c.id,
    criterionName: c.name,
    dimension: dim.id,
    method: c.method,
    rule: c.applicability.rule,
    na: isNotApplicable(c, facts),
    levels: levelsOf(c),
    measurements: m ? plainWords(m.values) : [],
    scriptLevel: m?.impliedLevel ?? null,
    judge: w.judge?.[c.id] ?? null,
    previous: prior?.source === 'paul' ? prior.score : null,
    shots: shotsFor(w.type, c.id, w.measurements),
    harness: harnessLinks(w.type, c.id, w.measurements),
    exemplarPick: EXEMPLAR_CRITERIA.includes(c.id),
    exemplars: (Object.entries(exemplarFor) as [`${Level}`, string][])
      .flatMap(([level, type]) => {
        const shot = shotsFor(type, 'V1', shotWidgets.get(type) ?? [])[0];
        return shot && type !== w.type
          ? [
              {
                level: Number(level) as Level,
                widgetType: type,
                src: shot.src,
                from: shot.from,
              },
            ]
          : [];
      })
      .sort((a, b) => a.level - b.level),
  };
}

const disagrees = (card: DeckCard, w: WidgetInput): boolean => {
  const judge = card.judge?.score ?? null;
  if (card.na) return false;
  if (card.scriptLevel !== null && judge !== null && card.scriptLevel !== judge)
    return true;
  const prior = w.scorecard?.criteria[card.criterionId]?.candidates;
  return (
    prior?.paul != null && prior?.judge != null && prior.paul !== prior.judge
  );
};

export function buildDeck(opts: DeckOptions): GradingDeck {
  const { rubric, mode, widgets } = opts;
  if (mode === 'criterion' && !opts.criterion)
    throw new Error('criterion mode needs a criterion id');
  const shotWidgets = new Map(widgets.map((w) => [w.type, w.measurements]));
  const cards: DeckCard[] = [];
  const only = opts.only ? new Set(opts.only) : null;
  const add = (dim: Dimension, c: Criterion, w: WidgetInput) => {
    if (only && !only.has(`${w.type}:${c.id}`)) return;
    const card = buildCard(
      dim,
      c,
      w,
      applicabilityFacts(w),
      opts.exemplars,
      shotWidgets
    );
    if (mode === 'disagreements' && !disagrees(card, w)) return;
    cards.push(card);
  };
  if (mode === 'criterion') {
    const dim = rubric.dimensions.find((d) =>
      d.criteria.some((c) => c.id === opts.criterion)
    );
    if (!dim) throw new Error(`unknown criterion ${opts.criterion}`);
    const c = dim.criteria.find((x) => x.id === opts.criterion)!;
    for (const w of widgets) add(dim, c, w);
  } else {
    for (const w of widgets)
      for (const dim of rubric.dimensions)
        for (const c of dim.criteria) add(dim, c, w);
  }
  return {
    deckId: opts.deckId,
    mode,
    rubricVersion: rubric.version,
    runId: opts.runId,
    createdAt: opts.createdAt,
    harnessOrigin: opts.harnessOrigin ?? 'http://localhost:3000',
    gates: Object.fromEntries(
      widgets.map((w) => [w.type, gatesOf(w.measurements)])
    ),
    cards,
  };
}
