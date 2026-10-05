// pnpm run grader:measure [--type clock,poll] [--fixtures typical] [--run-id name] [--workers 3] [--gates-only] [--check-baseline] [--write-baseline]

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Measurement } from './types.ts';
import {
  BASELINE_PATH,
  buildBaseline,
  compareBaseline,
  comparisonMarkdown,
  currentFailures,
  type GateBaseline,
} from './measure/baseline.ts';
import { gateFailures, summaryTable } from './measure/summary.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = process.argv.slice(2);
const option = (name: string): string[] => {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && args[i + 1])
      values.push(...args[i + 1].split(','));
    else if (args[i].startsWith(`--${name}=`))
      values.push(...args[i].slice(name.length + 3).split(','));
  }
  return values.filter(Boolean);
};

const flag = (name: string): boolean => args.includes(`--${name}`);
const gatesOnly = flag('gates-only');

const runId =
  option('run-id')[0] ?? new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(root, 'scripts/widget-grader/out', runId);
mkdirSync(outDir, { recursive: true });

const started = Date.now();
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'playwright',
    'test',
    '-c',
    'playwright.grader.config.ts',
    'measure.pw.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      GRADER_TYPES: option('type').join(','),
      GRADER_FIXTURES: option('fixtures').join(','),
      GRADER_OUT: outDir,
      ...(gatesOnly ? { GRADER_GATES_ONLY: '1' } : {}),
      ...(option('workers')[0] ? { GRADER_WORKERS: option('workers')[0] } : {}),
    },
  }
);

const dir = join(outDir, 'measurements');
const byWidget: Record<string, Measurement[]> = {};
if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')))
    byWidget[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(dir, file), 'utf8')
    );
}
const table = summaryTable(byWidget);
const failures = gateFailures(byWidget);
const minutes = ((Date.now() - started) / 60000).toFixed(1);
const baselineFile = join(root, BASELINE_PATH);
const baseline: GateBaseline = existsSync(baselineFile)
  ? JSON.parse(readFileSync(baselineFile, 'utf8'))
  : { runId: 'none', generatedAt: '', failures: {} };
const current = currentFailures(byWidget);
const measured = Object.keys(byWidget);
const comparison = compareBaseline(baseline, current, measured);
writeFileSync(
  join(outDir, 'gate-report.json'),
  `${JSON.stringify({ runId, measured, ...comparison }, null, 2)}\n`
);
const report = [
  `# Widget grader run ${runId}`,
  '',
  `${measured.length} widgets in ${minutes} min${gatesOnly ? ', gates only' : ''}. "judge" means the script leaves the level to the judge.`,
  '',
  table,
  '',
  '## Gate failures',
  '',
  ...(failures.length ? failures.map((f) => `- ${f}`) : ['None.']),
  '',
  comparisonMarkdown(comparison),
  '',
].join('\n');
writeFileSync(join(outDir, 'summary.md'), report);
console.log(`\n${report}\nWrote ${join(outDir, 'summary.md')}`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

if (flag('write-baseline')) {
  // Widgets left out of this run keep their baseline entries.
  const kept = Object.entries(baseline.failures)
    .filter(([type]) => !measured.includes(type))
    .flatMap(([type, gates]) =>
      gates.map((gate) => ({ type, gate, detail: '' }))
    );
  const next = buildBaseline(runId, [...kept, ...current]);
  writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${BASELINE_PATH}`);
}

const playwrightFailed = (result.status ?? 1) !== 0;
const newFailures = flag('check-baseline') && comparison.added.length > 0;
process.exit(playwrightFailed || newFailures ? 1 : 0);
