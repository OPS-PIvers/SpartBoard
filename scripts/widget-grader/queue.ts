// Loop priority queue (R9, R20-R26): what the widget rubric loop routine works on next.
// node scripts/widget-grader/queue.ts [--open clock:layout,poll:visual] [--json]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { meetsLoopTarget, rollup } from './rollup.ts';
import type {
  CriterionId,
  CriterionScore,
  DimensionId,
  GateId,
  Rubric,
  Scorecard,
} from './types.ts';

export const MAX_OPEN_LOOP_PRS = 3;

/** R9 input: boards per widget type in prod, aggregate only (scripts/widget-grader/usage.ts). */
export interface UsageFile {
  generatedAt: string;
  project: string;
  boards: number;
  counts: Record<string, number>;
}

export interface PlatformFile {
  rubricVersion: string;
  lifts: CriterionId[];
  criteria: { id: string; name: string }[];
  scores: Record<string, Partial<CriterionScore>>;
}

export interface OpenLoop {
  widgetType: string;
  dimension?: DimensionId;
}

/** Criteria paused by a spot check (R33, R34); loops skip them until re-normed. */
export type PausedCriteria = Partial<Record<CriterionId, unknown>>;

export interface QueueInput {
  rubric: Rubric;
  scorecards: Scorecard[];
  usage?: UsageFile | null;
  platform?: PlatformFile | null;
  /** Gate failures CI already tolerates (docs/widget-rubric/gate-baseline.json). */
  gateBaseline?: Record<string, GateId[]> | null;
  openLoops?: OpenLoop[];
  paused?: PausedCriteria;
}

export type QueueItem =
  | {
      kind: 'gate';
      widgetType: string;
      gates: GateId[];
      dimension: DimensionId;
      usage: number | null;
      priority: number;
    }
  | {
      kind: 'platform';
      criterionId: string;
      name: string;
      score: number;
    }
  | {
      kind: 'widget';
      widgetType: string;
      dimension: DimensionId;
      dimensionScore: number;
      criterionId: CriterionId;
      criterionScore: number;
      gap: number;
      usage: number | null;
      priority: number;
    };

export interface Queue {
  items: QueueItem[];
  /** Scorecards that must be re-graded before any loop touches them (R26). */
  regrade: string[];
  /** Widgets with nothing scored yet: grade them before they can be queued. */
  ungraded: string[];
  /** Widgets at or above the loop target (R7). */
  atTarget: string[];
  usedUsage: boolean;
}

const major = (v: string): number => Number(v.split('.')[0]);

/** R26: a major version change stales the whole card; otherwise only criteria flagged stale need re-grading. */
export function needsRegrade(rubric: Rubric, card: Scorecard): boolean {
  if (card.stale || major(card.rubricVersion) !== major(rubric.version))
    return true;
  return Object.values(card.criteria).some((c) => c?.stale);
}

/** Weighted shortfall below the loop target across scored dimensions. */
export function distanceFromTarget(
  rubric: Rubric,
  card: Scorecard
): number | null {
  const r = rollup(rubric, card);
  const scored = r.dimensions.filter((d) => d.score !== null);
  if (!scored.length) return null;
  const target = rubric.loopTarget.minDimensionScore;
  const total = scored.reduce(
    (sum, d) => sum + (d.weight / 100) * Math.max(0, target - (d.score ?? 0)),
    0
  );
  return Math.round(total * 1000) / 1000;
}

// G1/G2 are layout failures, G3/G4 robustness; a gate loop works in that dimension.
const GATE_DIMENSION: Record<GateId, DimensionId> = {
  G1: 'layout',
  G2: 'layout',
  G3: 'robustness',
  G4: 'robustness',
};

/** R8: lowest dimension first, then its lowest criterion, skipping paused criteria. */
export function pickTarget(
  rubric: Rubric,
  card: Scorecard,
  paused: PausedCriteria = {},
  skipDimensions: DimensionId[] = []
): {
  dimension: DimensionId;
  dimensionScore: number;
  criterionId: CriterionId;
  criterionScore: number;
} | null {
  const target = rubric.loopTarget.minDimensionScore;
  const r = rollup(rubric, card);
  const dims = r.dimensions
    .filter(
      (d) =>
        d.score !== null && d.score < target && !skipDimensions.includes(d.id)
    )
    .sort((a, b) => (a.score as number) - (b.score as number));
  for (const d of dims) {
    const def = rubric.dimensions.find((x) => x.id === d.id);
    const criteria = (def?.criteria ?? [])
      .flatMap((c) => {
        const score = card.criteria[c.id]?.score;
        return typeof score === 'number' && score < 4 && !(c.id in paused)
          ? [{ id: c.id, score }]
          : [];
      })
      .sort((a, b) => a.score - b.score);
    if (criteria.length)
      return {
        dimension: d.id,
        dimensionScore: Math.round((d.score as number) * 1000) / 1000,
        criterionId: criteria[0].id,
        criterionScore: criteria[0].score,
      };
  }
  return null;
}

export function platformGaps(
  rubric: Rubric,
  platform: PlatformFile | null | undefined
): Extract<QueueItem, { kind: 'platform' }>[] {
  if (!platform) return [];
  const target = rubric.loopTarget.minDimensionScore;
  return platform.criteria
    .flatMap((c) => {
      const score = platform.scores[c.id]?.score;
      return typeof score === 'number' && score < target ? [{ c, score }] : [];
    })
    .sort((a, b) => a.score - b.score || a.c.id.localeCompare(b.c.id))
    .map(({ c, score }) => ({
      kind: 'platform' as const,
      criterionId: c.id,
      name: c.name,
      score,
    }));
}

const usageFactor = (usage: UsageFile | null | undefined, type: string) =>
  usage ? (usage.counts[type] ?? 0) + 1 : 1;

export function buildQueue(input: QueueInput): Queue {
  const { rubric, usage } = input;
  const paused = input.paused ?? {};
  const open = input.openLoops ?? [];
  const openTypes = new Set(open.map((o) => o.widgetType));
  const gates: Extract<QueueItem, { kind: 'gate' }>[] = [];
  const widgets: Extract<QueueItem, { kind: 'widget' }>[] = [];
  const out: Queue = {
    items: [],
    regrade: [],
    ungraded: [],
    atTarget: [],
    usedUsage: Boolean(usage),
  };

  for (const card of [...input.scorecards].sort((a, b) =>
    a.widgetType.localeCompare(b.widgetType)
  )) {
    const type = card.widgetType;
    if (needsRegrade(rubric, card)) {
      out.regrade.push(type);
      continue;
    }
    const failing = new Set<GateId>([
      ...rollup(rubric, card).gateFailures,
      ...(input.gateBaseline?.[type] ?? []),
    ]);
    const distance = distanceFromTarget(rubric, card);
    if (openTypes.has(type)) continue;
    const u = usage ? (usage.counts[type] ?? 0) : null;
    if (failing.size) {
      const ids = [...failing].sort();
      gates.push({
        kind: 'gate',
        widgetType: type,
        gates: ids,
        dimension: GATE_DIMENSION[ids[0]],
        usage: u,
        priority: usageFactor(usage, type) * (1 + (distance ?? 0)),
      });
      continue;
    }
    if (distance === null) {
      out.ungraded.push(type);
      continue;
    }
    if (meetsLoopTarget(rubric, rollup(rubric, card))) {
      out.atTarget.push(type);
      continue;
    }
    const pick = pickTarget(rubric, card, paused);
    if (!pick) continue;
    widgets.push({
      kind: 'widget',
      widgetType: type,
      ...pick,
      gap: distance,
      usage: u,
      priority: Math.round(usageFactor(usage, type) * distance * 1000) / 1000,
    });
  }

  const byPriority = <T extends { priority: number; widgetType: string }>(
    a: T,
    b: T
  ) => b.priority - a.priority || a.widgetType.localeCompare(b.widgetType);
  gates.sort(byPriority);
  widgets.sort(byPriority);

  // Platform gaps go ahead of the first loop that would work on a criterion the Platform lifts.
  const lifts = new Set(input.platform?.lifts ?? []);
  const platform = platformGaps(rubric, input.platform);
  const firstLifted = widgets.findIndex((w) => lifts.has(w.criterionId));
  const rest: QueueItem[] =
    firstLifted < 0 || !platform.length
      ? [...widgets, ...platform]
      : [
          ...widgets.slice(0, firstLifted),
          ...platform,
          ...widgets.slice(firstLifted),
        ];
  out.items = [...gates, ...rest];
  return out;
}

export interface AgreementLatest {
  latest: { pass: boolean; rubricVersion: string; checkedAt: string } | null;
}

/** R22 and R25: the loop may run only when calibration passed under this major version and fewer than 3 loop PRs are open. */
export function preflight(opts: {
  rubric: Rubric;
  agreement: AgreementLatest | null;
  openLoopPrs: number;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const latest = opts.agreement?.latest;
  if (!latest) reasons.push('calibration has not run (no agreement.json)');
  else if (!latest.pass) reasons.push('the latest calibration check failed');
  else if (major(latest.rubricVersion) !== major(opts.rubric.version))
    reasons.push(
      `calibration ran under rubric ${latest.rubricVersion}; ${opts.rubric.version} needs a new one`
    );
  if (opts.openLoopPrs >= MAX_OPEN_LOOP_PRS)
    reasons.push(`${opts.openLoopPrs} loop PRs already open`);
  return { ok: reasons.length === 0, reasons };
}

const readJson = <T>(path: string): T | null =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;

export function loadQueueInput(
  root: string,
  openLoops: OpenLoop[] = []
): QueueInput & { agreement: AgreementLatest | null } {
  const dir = join(root, 'docs/widget-rubric');
  const cardsDir = join(dir, 'scorecards');
  const spot = readJson<{ paused?: PausedCriteria }>(
    join(dir, 'spot-checks.json')
  );
  return {
    rubric: readJson<Rubric>(join(dir, 'rubric.json')) as Rubric,
    scorecards: readdirSync(cardsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<Scorecard>(join(cardsDir, f)) as Scorecard),
    usage: readJson<UsageFile>(join(dir, 'usage.json')),
    platform: readJson<PlatformFile>(join(dir, 'platform.json')),
    gateBaseline:
      readJson<{ failures: Record<string, GateId[]> }>(
        join(dir, 'gate-baseline.json')
      )?.failures ?? null,
    paused: spot?.paused ?? {},
    openLoops,
    agreement: readJson<AgreementLatest>(
      join(dir, 'calibration/agreement.json')
    ),
  };
}

export const describeItem = (i: QueueItem): string =>
  i.kind === 'gate'
    ? `${i.widgetType}: fix ${i.gates.join(', ')} (${i.dimension})`
    : i.kind === 'platform'
      ? `Platform ${i.criterionId} ${i.name} (at ${i.score})`
      : `${i.widgetType}: ${i.dimension} ${i.dimensionScore}, start with ${i.criterionId} at ${i.criterionScore}`;

function main(argv: string[]): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const i = argv.indexOf('--open');
  const openLoops: OpenLoop[] =
    i >= 0 && argv[i + 1]
      ? argv[i + 1]
          .split(',')
          .filter(Boolean)
          .map((s) => {
            const [widgetType, dimension] = s.split(':');
            return { widgetType, dimension: dimension as DimensionId };
          })
      : [];
  const input = loadQueueInput(root, openLoops);
  const gate = preflight({
    rubric: input.rubric,
    agreement: input.agreement,
    openLoopPrs: openLoops.length,
  });
  const queue = buildQueue(input);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ preflight: gate, ...queue }, null, 2));
  } else {
    console.log(
      gate.ok
        ? 'Loop may run.'
        : `Loop must not run: ${gate.reasons.join('; ')}`
    );
    console.log(
      queue.usedUsage
        ? 'Ordered by prod usage × gap.'
        : 'No usage.json: ordered by gap only.'
    );
    if (queue.regrade.length)
      console.log(`Re-grade first: ${queue.regrade.join(', ')}`);
    queue.items
      .slice(0, 10)
      .forEach((item, n) => console.log(`${n + 1}. ${describeItem(item)}`));
    if (!queue.items.length) console.log('Queue is empty.');
    console.log(
      `${queue.ungraded.length} ungraded, ${queue.atTarget.length} at target.`
    );
  }
  process.exit(gate.ok ? 0 : 3);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
