// Loop guards: the no-regression check (R20), supervised start (R32) and the weekly spot check (R33, R34).
// node scripts/widget-grader/loop.ts compare --before <card.json> --after <card.json>
// node scripts/widget-grader/loop.ts supervision
// node scripts/widget-grader/loop.ts new-widget --type <widgetType>
// node scripts/widget-grader/loop.ts spot-sample [--n 8] [--days 14]
// node scripts/widget-grader/loop.ts spot-record --deck <deckId>

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from './rollup.ts';
import type {
  CriterionId,
  DimensionId,
  GateId,
  Level,
  Rubric,
  Scorecard,
} from './types.ts';

export interface Regression {
  criterionId: CriterionId;
  before: Level;
  after: Level | null;
}

export interface Comparison {
  ok: boolean;
  drops: Regression[];
  gateFailures: GateId[];
  /** Criteria that rose, for the PR body. */
  gains: { criterionId: CriterionId; before: Level | null; after: Level }[];
  before: { weighted: number | null; letter: string | null };
  after: { weighted: number | null; letter: string | null };
}

/** R20: the whole widget is re-graded; any criterion drop or any gate failure rejects the loop. */
export function compareScorecards(
  rubric: Rubric,
  before: Scorecard,
  after: Scorecard
): Comparison {
  const drops: Regression[] = [];
  const gains: Comparison['gains'] = [];
  for (const d of rubric.dimensions) {
    for (const c of d.criteria) {
      const b = before.criteria[c.id]?.score;
      const a = after.criteria[c.id]?.score;
      if (typeof b === 'number' && (typeof a !== 'number' || a < b))
        drops.push({ criterionId: c.id, before: b, after: a ?? null });
      else if (typeof a === 'number' && (typeof b !== 'number' || a > b))
        gains.push({ criterionId: c.id, before: b ?? null, after: a });
    }
  }
  const rb = rollup(rubric, before);
  const ra = rollup(rubric, after);
  return {
    ok: drops.length === 0 && ra.gateFailures.length === 0,
    drops,
    gateFailures: ra.gateFailures,
    gains,
    before: { weighted: rb.weighted, letter: rb.letter },
    after: { weighted: ra.weighted, letter: ra.letter },
  };
}

/** R24: a new widget's PR needs every dimension graded, no gate failure, and B or better. */
export function newWidgetGate(
  rubric: Rubric,
  card: Scorecard | null
): { ok: boolean; message: string } {
  if (!card) return { ok: false, message: 'No scorecard: run /grade-widget.' };
  const r = rollup(rubric, card);
  const missing = r.dimensions.filter((d) => d.score === null);
  if (missing.length)
    return {
      ok: false,
      message: `Not graded: ${missing.map((d) => d.name).join(', ')}.`,
    };
  const ok =
    r.gateFailures.length === 0 &&
    r.letter !== null &&
    ['A', 'B'].includes(r.letter);
  const score = (r.weighted ?? 0).toFixed(2);
  return {
    ok,
    message: ok
      ? `${card.widgetType}: ${r.letter} (${score}).`
      : `${card.widgetType}: ${r.letter} (${score})${r.gateFailures.length ? `, gate failures ${r.gateFailures.join(', ')}` : ''}; needs B or better.`,
  };
}

export type LoopOutcome = 'open' | 'accepted' | 'changed' | 'rejected';

export interface SupervisedLoop {
  pr: string;
  widgetType: string;
  dimension: DimensionId;
  openedAt: string;
  outcome: LoopOutcome;
  /** Automatic levels the loop changed, so a spot check can tell a real rise from a gamed one. */
  changes?: Partial<
    Record<CriterionId, { before: Level | null; after: Level }>
  >;
}

export interface SupervisionFile {
  /** Loops before this time don't count toward light review; set when a spot check fails. */
  resetAt: string | null;
  loops: SupervisedLoop[];
}

export const SUPERVISION = { window: 10, acceptedNeeded: 8 } as const;

/** R32: full review until 8 of the first 10 loops since the last reset were accepted unchanged. */
export function reviewMode(file: SupervisionFile): {
  mode: 'full' | 'light';
  decided: number;
  accepted: number;
} {
  const counted = file.loops
    .filter((l) => !file.resetAt || l.openedAt >= file.resetAt)
    .filter((l) => l.outcome !== 'open')
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    .slice(0, SUPERVISION.window);
  const accepted = counted.filter((l) => l.outcome === 'accepted').length;
  return {
    mode:
      counted.length >= SUPERVISION.window &&
      accepted >= SUPERVISION.acceptedNeeded
        ? 'light'
        : 'full',
    decided: counted.length,
    accepted,
  };
}

export interface SpotCard {
  widgetType: string;
  criterionId: CriterionId;
  /** Script or judge level before the loop that touched it, if any. */
  autoBefore: Level | null;
  /** Script or judge level the loop left in the scorecard. */
  auto: Level;
  /** Paul's blind level. */
  paul: Level;
}

export interface SpotCheck {
  date: string;
  deckId: string;
  cards: SpotCard[];
  drift: CriterionId[];
  gaming: CriterionId[];
}

export interface SpotCheckFile {
  paused: Partial<Record<CriterionId, { since: string; reason: string }>>;
  checks: SpotCheck[];
}

export const SPOT = { cards: 8, driftGap: 2, driftMean: 1 } as const;

/** R33: a criterion drifts when one card is 2+ levels off Paul, or its mean gap is over 1. */
export function findDrift(cards: SpotCard[]): CriterionId[] {
  const by = new Map<CriterionId, number[]>();
  for (const c of cards)
    by.set(c.criterionId, [
      ...(by.get(c.criterionId) ?? []),
      Math.abs(c.auto - c.paul),
    ]);
  return [...by]
    .filter(
      ([, gaps]) =>
        gaps.some((g) => g >= SPOT.driftGap) ||
        gaps.reduce((s, g) => s + g, 0) / gaps.length > SPOT.driftMean
    )
    .map(([id]) => id)
    .sort();
}

/** R34: across spot checks, a criterion whose automatic score rose on most cards where Paul's did not. */
export function findGaming(history: SpotCard[]): CriterionId[] {
  const by = new Map<CriterionId, { rose: number; hollow: number }>();
  for (const c of history) {
    if (c.autoBefore === null || c.auto <= c.autoBefore) continue;
    const row = by.get(c.criterionId) ?? { rose: 0, hollow: 0 };
    row.rose++;
    if (c.paul <= c.autoBefore) row.hollow++;
    by.set(c.criterionId, row);
  }
  return [...by]
    .filter(([, r]) => r.rose >= 2 && r.hollow * 2 > r.rose)
    .map(([id]) => id)
    .sort();
}

/** Records a spot check, pauses drifting or gamed criteria, and resets supervision when anything failed. */
export function recordSpotCheck(
  file: SpotCheckFile,
  supervision: SupervisionFile,
  check: Omit<SpotCheck, 'drift' | 'gaming'>
): { spot: SpotCheckFile; supervision: SupervisionFile; failed: boolean } {
  const drift = findDrift(check.cards);
  const gaming = findGaming([
    ...file.checks.flatMap((c) => c.cards),
    ...check.cards,
  ]);
  const paused = { ...file.paused };
  for (const id of drift)
    paused[id] ??= { since: check.date, reason: 'drift in spot check' };
  for (const id of gaming)
    paused[id] ??= {
      since: check.date,
      reason: "scores rose without Paul's agreeing",
    };
  const failed = drift.length > 0 || gaming.length > 0;
  return {
    spot: { paused, checks: [...file.checks, { ...check, drift, gaming }] },
    supervision: failed ? { ...supervision, resetAt: check.date } : supervision,
    failed,
  };
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** R33: n cards from recent automatic scores, seeded so a re-run picks the same ones. */
export function sampleSpotCards(
  cards: Scorecard[],
  opts: { n?: number; since: string; seed: string }
): { widgetType: string; criterionId: CriterionId }[] {
  const pool: { widgetType: string; criterionId: CriterionId; key: number }[] =
    [];
  for (const card of cards) {
    for (const [id, s] of Object.entries(card.criteria)) {
      if (!s || s.source === 'paul' || typeof s.score !== 'number') continue;
      if (s.gradedAt < opts.since) continue;
      pool.push({
        widgetType: card.widgetType,
        criterionId: id as CriterionId,
        key: hash(`${opts.seed}:${card.widgetType}:${id}`),
      });
    }
  }
  return pool
    .sort((a, b) => a.key - b.key)
    .slice(0, opts.n ?? SPOT.cards)
    .map(({ widgetType, criterionId }) => ({ widgetType, criterionId }));
}

export interface ExampleLine {
  widgetType: string;
  criterionId: CriterionId;
  paul: Level;
  judge: Level | null;
  script: Level | null;
  deckId: string;
}

/** Spot cards from a graded deck: the automatic level is the judge's, else the script's. */
export function spotCardsFromExamples(
  examples: ExampleLine[],
  deckId: string,
  supervision: SupervisionFile
): SpotCard[] {
  const lastChange = (type: string, id: CriterionId) =>
    [...supervision.loops]
      .filter((l) => l.widgetType === type && l.changes?.[id])
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0]?.changes?.[id];
  return examples
    .filter((e) => e.deckId === deckId)
    .flatMap((e): SpotCard[] => {
      const auto = e.judge ?? e.script;
      if (auto === null) return [];
      return [
        {
          widgetType: e.widgetType,
          criterionId: e.criterionId,
          autoBefore: lastChange(e.widgetType, e.criterionId)?.before ?? null,
          auto,
          paul: e.paul,
        },
      ];
    });
}

const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;

function main(argv: string[]): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const dir = join(root, 'docs/widget-rubric');
  const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rubric = readJson<Rubric>(join(dir, 'rubric.json'), {} as Rubric);
  const cmd = argv[0];
  if (cmd === 'compare') {
    const before = arg('before');
    const after = arg('after');
    if (!before || !after) {
      console.error('usage: loop.ts compare --before <file> --after <file>');
      process.exit(2);
    }
    const c = compareScorecards(
      rubric,
      readJson<Scorecard>(resolve(root, before), {} as Scorecard),
      readJson<Scorecard>(resolve(root, after), {} as Scorecard)
    );
    console.log(JSON.stringify(c, null, 2));
    process.exit(c.ok ? 0 : 1);
  }
  if (cmd === 'new-widget') {
    const type = arg('type');
    if (!type) {
      console.error('usage: loop.ts new-widget --type <widgetType>');
      process.exit(2);
    }
    const r = newWidgetGate(
      rubric,
      readJson<Scorecard | null>(join(dir, 'scorecards', `${type}.json`), null)
    );
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'supervision') {
    const file = readJson<SupervisionFile>(join(dir, 'supervision.json'), {
      resetAt: null,
      loops: [],
    });
    console.log(JSON.stringify(reviewMode(file)));
    return;
  }
  if (cmd === 'spot-sample') {
    const days = Number(arg('days') ?? 14);
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const cardsDir = join(dir, 'scorecards');
    const cards = readdirSync(cardsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<Scorecard>(join(cardsDir, f), {} as Scorecard));
    console.log(
      JSON.stringify(
        sampleSpotCards(cards, {
          n: Number(arg('n') ?? SPOT.cards),
          since,
          seed: since.slice(0, 10),
        }),
        null,
        2
      )
    );
    return;
  }
  if (cmd === 'spot-record') {
    const deckId = arg('deck');
    if (!deckId) {
      console.error('usage: loop.ts spot-record --deck <deckId>');
      process.exit(2);
    }
    const supPath = join(dir, 'supervision.json');
    const spotPath = join(dir, 'spot-checks.json');
    const examplesPath = join(dir, 'calibration/examples.jsonl');
    const supervision = readJson<SupervisionFile>(supPath, {
      resetAt: null,
      loops: [],
    });
    const examples = existsSync(examplesPath)
      ? readFileSync(examplesPath, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as ExampleLine)
      : [];
    const cards = spotCardsFromExamples(examples, deckId, supervision);
    const result = recordSpotCheck(
      readJson<SpotCheckFile>(spotPath, { paused: {}, checks: [] }),
      supervision,
      { date: new Date().toISOString(), deckId, cards }
    );
    writeFileSync(spotPath, `${JSON.stringify(result.spot, null, 2)}\n`);
    writeFileSync(supPath, `${JSON.stringify(result.supervision, null, 2)}\n`);
    const last = result.spot.checks[result.spot.checks.length - 1];
    console.log(
      JSON.stringify({
        cards: cards.length,
        drift: last.drift,
        gaming: last.gaming,
        failed: result.failed,
      })
    );
    process.exit(result.failed ? 1 : 0);
  }
  console.error(
    'usage: loop.ts compare|new-widget|supervision|spot-sample|spot-record'
  );
  process.exit(2);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
