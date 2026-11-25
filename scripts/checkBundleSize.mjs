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

export function dashboardViewChunks(files) {
  return files.filter((f) => /^DashboardView-.*\.js$/.test(f));
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
      `First-load JS is ${Math.round(initialGzip / KB)} kB gzip, over the ${BUDGETS.initialGzipBytes / KB} kB budget; raise BUDGETS.initialGzipBytes in scripts/checkBundleSize.mjs in this PR if the growth is intended`
    );
  }
  const dvFiles = dashboardViewChunks(readdirSync(path.join(dist, 'assets')));
  if (dvFiles.length === 0)
    problems.push('No DashboardView chunk found in dist/assets');
  else {
    const size = dvFiles.reduce(
      (sum, f) => sum + readFileSync(path.join(dist, 'assets', f)).length,
      0
    );
    if (size > BUDGETS.dashboardViewRawBytes) {
      problems.push(
        `DashboardView chunks (${dvFiles.join(', ')}) are ${Math.round(size / KB)} kB, over the ${BUDGETS.dashboardViewRawBytes / KB} kB budget; raise BUDGETS.dashboardViewRawBytes in scripts/checkBundleSize.mjs in this PR if the growth is intended`
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
