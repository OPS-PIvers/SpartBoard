import type { CriterionId, GateId, Measurement } from '../types';

const GATES: GateId[] = ['G1', 'G2', 'G3', 'G4'];
const CRITERIA: CriterionId[] = [
  'S1',
  'S2',
  'S3',
  'S5',
  'S6',
  'S8',
  'I1',
  'I2',
  'I7',
  'I3',
  'I4',
  'I5',
  'V5',
  'C4',
  'C6',
  'R1',
  'R2',
  'R3',
  'R5',
];

/** Markdown table: one row per widget, gate pass/fail and the level each criterion's script implies. */
export function summaryTable(byWidget: Record<string, Measurement[]>): string {
  const head = ['Widget', ...GATES, ...CRITERIA];
  const rows = [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
  ];
  for (const [type, ms] of Object.entries(byWidget).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const widgetLevel = ms.filter((m) => m.size === null);
    const gates = GATES.map((g) => {
      const m = widgetLevel.find((x) => x.gate === g);
      return m ? (m.pass ? 'pass' : 'FAIL') : '–';
    });
    const levels = CRITERIA.map((c) => {
      const m = widgetLevel.find((x) => x.criterionId === c);
      if (!m) return '–';
      if (m.values.applicable === false) return 'n/a';
      return m.impliedLevel === null || m.impliedLevel === undefined
        ? 'judge'
        : String(m.impliedLevel);
    });
    const partial = widgetLevel.some((m) => m.values.partial)
      ? ' (partial)'
      : '';
    rows.push(`| ${[`${type}${partial}`, ...gates, ...levels].join(' | ')} |`);
  }
  return rows.join('\n');
}

/** One line per failing gate with where it failed and the first offenders. */
export function gateFailures(
  byWidget: Record<string, Measurement[]>
): string[] {
  const lines: string[] = [];
  for (const [type, ms] of Object.entries(byWidget)) {
    for (const m of ms) {
      if (m.size !== null || !m.gate || m.pass) continue;
      const where = m.values.where ? ` at ${m.values.where}` : '';
      const what = m.values.firstOffenders || m.values.offenders || '';
      lines.push(`${type} ${m.gate}${where}: ${what}`);
    }
  }
  return lines;
}
