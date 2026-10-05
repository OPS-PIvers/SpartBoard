// R22 calibration check: the judge's blind runs on held-out widgets against Paul's scores.
// node scripts/widget-grader/calibration/check.ts --held-out a,b,c,d,e --runs out/x/judge/a.run1.json,...

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CriterionId, Level } from '../types.ts';
import type { CalibrationExample } from '../grading/apply.ts';
import type { JudgeResult } from '../judge/parse.ts';

export const THRESHOLDS = {
  exact: 0.6,
  withinOne: 0.95,
  maxSpread: 1,
  runsPerWidget: 3,
} as const;

export interface Agreement {
  checkedAt: string;
  rubricVersion: string;
  heldOut: string[];
  pairs: number;
  exact: number;
  withinOne: number;
  maxSpread: number;
  gatesCaught: { caught: number; total: number };
  pass: boolean;
  failures: string[];
  perCriterion: Partial<
    Record<CriterionId, { pairs: number; exact: number; withinOne: number }>
  >;
}

export interface AgreementFile {
  latest: Agreement | null;
  history: Agreement[];
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** Latest Paul score per widget and criterion. */
export function latestPaulScores(
  examples: CalibrationExample[],
  widgets: string[]
): Map<string, CalibrationExample> {
  const keep = new Set(widgets);
  const out = new Map<string, CalibrationExample>();
  for (const e of examples) {
    if (!keep.has(e.widgetType)) continue;
    const key = `${e.widgetType}__${e.criterionId}`;
    const prev = out.get(key);
    if (!prev || prev.gradedAt < e.gradedAt) out.set(key, e);
  }
  return out;
}

export function computeAgreement(opts: {
  examples: CalibrationExample[];
  runs: JudgeResult[];
  heldOut: string[];
  rubricVersion: string;
  checkedAt: string;
}): Agreement {
  const paul = latestPaulScores(opts.examples, opts.heldOut);
  const failures: string[] = [];
  let pairs = 0;
  let exact = 0;
  let within = 0;
  let maxSpread = 0;
  let gateTotal = 0;
  let gateCaught = 0;
  const per: Agreement['perCriterion'] = {};

  for (const w of opts.heldOut) {
    const n = opts.runs.filter((r) => r.widgetType === w).length;
    if (n < THRESHOLDS.runsPerWidget)
      failures.push(`${w}: ${n} judge runs, need ${THRESHOLDS.runsPerWidget}`);
    if (![...paul.values()].some((e) => e.widgetType === w))
      failures.push(`${w}: no Paul scores`);
  }

  for (const e of paul.values()) {
    const levels = opts.runs
      .filter((r) => r.widgetType === e.widgetType)
      .map((r) => r.scores[e.criterionId]?.score)
      .filter((l): l is Level => typeof l === 'number');
    if (levels.length === 0) continue;
    const row = (per[e.criterionId] ??= { pairs: 0, exact: 0, withinOne: 0 });
    for (const l of levels) {
      pairs++;
      row.pairs++;
      if (l === e.paul) {
        exact++;
        row.exact++;
      }
      if (Math.abs(l - e.paul) <= 1) {
        within++;
        row.withinOne++;
      }
    }
    maxSpread = Math.max(maxSpread, Math.max(...levels) - Math.min(...levels));
    // Level 0 is the gate failure where a gate covers it; the judge must catch it on every run.
    if (e.paul === 0) {
      gateTotal++;
      if (levels.every((l) => l === 0)) gateCaught++;
    }
  }

  for (const row of Object.values(per)) {
    row.exact = round(row.exact / row.pairs);
    row.withinOne = round(row.withinOne / row.pairs);
  }
  const exactRate = pairs ? round(exact / pairs) : 0;
  const withinRate = pairs ? round(within / pairs) : 0;
  if (pairs === 0) failures.push('no judge scores to compare');
  if (exactRate < THRESHOLDS.exact)
    failures.push(`exact ${exactRate} under ${THRESHOLDS.exact}`);
  if (withinRate < THRESHOLDS.withinOne)
    failures.push(`within one ${withinRate} under ${THRESHOLDS.withinOne}`);
  if (maxSpread > THRESHOLDS.maxSpread)
    failures.push(`3-run spread ${maxSpread} over ${THRESHOLDS.maxSpread}`);
  if (gateCaught < gateTotal)
    failures.push(`gate failures caught ${gateCaught} of ${gateTotal}`);

  return {
    checkedAt: opts.checkedAt,
    rubricVersion: opts.rubricVersion,
    heldOut: opts.heldOut,
    pairs,
    exact: exactRate,
    withinOne: withinRate,
    maxSpread,
    gatesCaught: { caught: gateCaught, total: gateTotal },
    pass: failures.length === 0,
    failures,
    perCriterion: per,
  };
}

export const readExamples = (path: string): CalibrationExample[] =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as CalibrationExample)
    : [];

export function appendAgreement(
  file: AgreementFile | null,
  a: Agreement
): AgreementFile {
  return { latest: a, history: [...(file?.history ?? []), a] };
}

function main(argv: string[]): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const arg = (name: string): string[] => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').filter(Boolean) : [];
  };
  const heldOut = arg('held-out');
  const runPaths = arg('runs');
  if (!heldOut.length || !runPaths.length) {
    console.error(
      'usage: check.ts --held-out a,b,c --runs f1.json,f2.json,...'
    );
    process.exit(2);
  }
  const calDir = join(root, 'docs/widget-rubric/calibration');
  const rubric = JSON.parse(
    readFileSync(join(root, 'docs/widget-rubric/rubric.json'), 'utf8')
  ) as { version: string };
  const agreement = computeAgreement({
    examples: readExamples(join(calDir, 'examples.jsonl')),
    runs: runPaths.map(
      (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8')) as JudgeResult
    ),
    heldOut,
    rubricVersion: rubric.version,
    checkedAt: new Date().toISOString(),
  });
  const path = join(calDir, 'agreement.json');
  const prev = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as AgreementFile)
    : null;
  writeFileSync(
    path,
    `${JSON.stringify(appendAgreement(prev, agreement), null, 2)}\n`
  );
  console.log(JSON.stringify(agreement, null, 2));
  process.exit(agreement.pass ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
