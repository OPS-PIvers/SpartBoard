// Gate baseline (docs/widget-rubric/gate-baseline.json): known gate failures CI tolerates until they are fixed.

import type { GateId, Measurement } from '../types';

export interface GateBaseline {
  /** Run id of the sweep that produced it. */
  runId: string;
  generatedAt: string;
  /** Widget type to its failing gates. */
  failures: Record<string, GateId[]>;
}

export interface GateFailure {
  type: string;
  gate: GateId;
  detail: string;
}

export interface BaselineComparison {
  /** Failing now, not in the baseline: these fail CI and open the nightly issue. */
  added: GateFailure[];
  /** In the baseline, passing now: the baseline should shrink. */
  fixed: { type: string; gate: GateId }[];
}

export const BASELINE_PATH = 'docs/widget-rubric/gate-baseline.json';

export function currentFailures(
  byWidget: Record<string, Measurement[]>
): GateFailure[] {
  const out: GateFailure[] = [];
  for (const [type, ms] of Object.entries(byWidget)) {
    for (const m of ms) {
      if (m.size !== null || !m.gate || m.pass) continue;
      const where = m.values.where ? ` at ${m.values.where}` : '';
      const what = m.values.firstOffenders || m.values.offenders || '';
      out.push({ type, gate: m.gate, detail: `${where} ${what}`.trim() });
    }
  }
  return out.sort((a, b) =>
    `${a.type}${a.gate}`.localeCompare(`${b.type}${b.gate}`)
  );
}

export function buildBaseline(
  runId: string,
  failures: GateFailure[],
  now = new Date()
): GateBaseline {
  const map: Record<string, GateId[]> = {};
  for (const f of failures) (map[f.type] ??= []).push(f.gate);
  const sorted: Record<string, GateId[]> = {};
  for (const type of Object.keys(map).sort())
    sorted[type] = [...new Set(map[type])].sort();
  return { runId, generatedAt: now.toISOString(), failures: sorted };
}

/** Compares only the widgets that were measured; a widget left out of the run keeps its baseline. */
export function compareBaseline(
  baseline: GateBaseline,
  failures: GateFailure[],
  measured: string[]
): BaselineComparison {
  const added = failures.filter(
    (f) => !(baseline.failures[f.type] ?? []).includes(f.gate)
  );
  const fixed: BaselineComparison['fixed'] = [];
  for (const type of measured) {
    for (const gate of baseline.failures[type] ?? []) {
      if (!failures.some((f) => f.type === type && f.gate === gate))
        fixed.push({ type, gate });
    }
  }
  return { added, fixed };
}

export function comparisonMarkdown(c: BaselineComparison): string {
  const lines = ['## Gate baseline', ''];
  if (c.added.length === 0) lines.push('No new gate failures.');
  else {
    lines.push('New gate failures (not in the baseline):', '');
    for (const f of c.added) lines.push(`- ${f.type} ${f.gate}: ${f.detail}`);
  }
  if (c.fixed.length) {
    lines.push(
      '',
      'Now passing, still in the baseline (run `pnpm run grader:measure --write-baseline` to drop them):',
      ''
    );
    for (const f of c.fixed) lines.push(`- ${f.type} ${f.gate}`);
  }
  return lines.join('\n');
}
