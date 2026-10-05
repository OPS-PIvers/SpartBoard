// pnpm run grader:measure [--type clock,poll] [--fixtures typical] [--run-id name] [--workers 3]

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Measurement } from './types.ts';
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
const report = [
  `# Widget grader run ${runId}`,
  '',
  `${Object.keys(byWidget).length} widgets in ${minutes} min. "judge" means the script leaves the level to the judge.`,
  '',
  table,
  '',
  '## Gate failures',
  '',
  ...(failures.length ? failures.map((f) => `- ${f}`) : ['None.']),
  '',
].join('\n');
writeFileSync(join(outDir, 'summary.md'), report);
console.log(`\n${report}\nWrote ${join(outDir, 'summary.md')}`);
process.exit(result.status ?? 1);
