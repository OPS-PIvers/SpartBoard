// Prints a before/after table from two bench result files: node scripts/bench/compare.ts baseline after
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, type ScenarioResult } from './run.ts';

const RESULTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'results'
);

const load = (label: string) =>
  (
    JSON.parse(readFileSync(path.join(RESULTS, `${label}.json`), 'utf8')) as {
      results: ScenarioResult[];
    }
  ).results;

const [beforeLabel = 'baseline', afterLabel = 'after'] = process.argv.slice(2);
const before = load(beforeLabel);
const after = load(afterLabel);

const COLUMNS = [
  ['actToLitP95', 'click to spotlight p95'],
  ['readyToLitP95', 'content to spotlight p95'],
  ['darkP95', 'spotlight gone p95'],
  ['runMsP95', 'worst search p95'],
  // Long tasks aren't compared: Chrome leaves most extension work out of them, so they flatter whichever build searches outside the page's frames.
  ['maxFrameGapP95', 'longest frame p95'],
] as const;

const ms = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}` : '-');

console.log(
  `| Scenario | CPU | ${COLUMNS.map(([, title]) => `${title} (ms)`).join(' | ')} |`
);
console.log(`|---|---|${COLUMNS.map(() => '---').join('|')}|`);
for (const a of after) {
  const b = before.find(
    (r) => r.scenario === a.scenario && r.throttle === a.throttle
  );
  if (!b) continue;
  const sb = summarize(b.transitions);
  const sa = summarize(a.transitions);
  const cells = COLUMNS.map(([key]) => `${ms(sb[key])} → **${ms(sa[key])}**`);
  console.log(`| ${a.scenario} | ${a.throttle}x | ${cells.join(' | ')} |`);
}
