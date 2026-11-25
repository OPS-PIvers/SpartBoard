// Fails the build job when the first-load JS or the DashboardView chunk outgrows its budget (AB-14).
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const KB = 1000;
// Measured on dev-paul 2026-11-24: first-load JS 717 kB gzip, DashboardView 423 kB raw; ~10% headroom.
export const BUDGETS = {
  initialGzipBytes: 800 * KB,
  dashboardViewRawBytes: 500 * KB,
};

export function initialScripts(html) {
  return [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
    (m) => m[1]
  );
}

export function checkBundle(dist) {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const scripts = initialScripts(html);
  const problems = [];
  if (scripts.length === 0)
    problems.push('index.html lists no startup scripts');
  const initialGzip = scripts.reduce(
    (sum, f) => sum + gzipSync(readFileSync(path.join(dist, f))).length,
    0
  );
  if (initialGzip > BUDGETS.initialGzipBytes) {
    problems.push(
      `First-load JS is ${Math.round(initialGzip / KB)} kB gzip, over the ${BUDGETS.initialGzipBytes / KB} kB budget`
    );
  }
  const dv = readdirSync(path.join(dist, 'assets')).find((f) =>
    /^DashboardView-.*\.js$/.test(f)
  );
  if (!dv) problems.push('No DashboardView chunk found in dist/assets');
  else {
    const size = readFileSync(path.join(dist, 'assets', dv)).length;
    if (size > BUDGETS.dashboardViewRawBytes) {
      problems.push(
        `${dv} is ${Math.round(size / KB)} kB, over the ${BUDGETS.dashboardViewRawBytes / KB} kB budget`
      );
    }
  }
  return { initialGzip, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { initialGzip, problems } = checkBundle(DIST);
  console.log(`First-load JS: ${Math.round(initialGzip / KB)} kB gzip`);
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
}
