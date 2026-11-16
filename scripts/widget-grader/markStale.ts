// R26 minor bump: mark changed criteria stale on every scorecard so the loop re-grades them.
// node scripts/widget-grader/markStale.ts --criteria S1,V3

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CriterionId, Scorecard } from './types.ts';

/** Marks graded, non-Paul entries stale; Paul's scores and N/A entries stay (R2, R15). */
export function markStale(card: Scorecard, ids: CriterionId[]): number {
  let marked = 0;
  for (const id of ids) {
    const entry = card.criteria[id];
    if (!entry || entry.score === null || entry.source === 'paul') continue;
    if (!entry.stale) {
      entry.stale = true;
      marked += 1;
    }
  }
  return marked;
}

function main(): void {
  const arg = process.argv.indexOf('--criteria');
  const ids = (arg > -1 ? (process.argv[arg + 1] ?? '') : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as CriterionId[];
  if (ids.length === 0) {
    console.error('usage: markStale.ts --criteria S1,V3');
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const dir = join(root, 'docs/widget-rubric/scorecards');
  let total = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const path = join(dir, file);
    const card = JSON.parse(readFileSync(path, 'utf8')) as Scorecard;
    const marked = markStale(card, ids);
    if (marked > 0) writeFileSync(path, `${JSON.stringify(card, null, 2)}\n`);
    total += marked;
  }
  console.log(`marked ${total} criterion scores stale`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
