#!/usr/bin/env node
// Plays a live tour on the dummy-backend board and reports each step (LIVE_TOUR_ONE_SHOT.md D7, D12).
// Usage: node scripts/run-live-tour.mjs <tour.json> [--base http://localhost:56320] [--out dir]
//        [--upload <upload_url> --ticket <ticket>]
// <tour.json> is what get_live_tour returned. Start the server first: the vite-verify launch config.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')
);
if (!file) {
  console.error(
    'usage: run-live-tour.mjs <tour.json> [--base url] [--out dir] [--upload url --ticket t]'
  );
  process.exit(2);
}
const base = flag('base') ?? 'http://localhost:56320';
const upload = flag('upload');
const ticket = flag('ticket');
if (!!upload !== !!ticket) {
  console.error('--upload and --ticket go together.');
  process.exit(2);
}

const view = JSON.parse(readFileSync(resolve(file), 'utf8'));
if (!view.set_id || !Array.isArray(view.steps)) {
  console.error('That file is not a get_live_tour result (set_id and steps).');
  process.exit(2);
}
const out = resolve(
  flag('out') ??
    join('.claude', 'live-tour-runs', `${Date.now()}-${view.set_id}`)
);
mkdirSync(out, { recursive: true });

const STEP_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Playwright's own Chromium when it is installed, else the machine's Chrome.
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(base);
await page.evaluate(() =>
  localStorage.setItem(
    'authBypassFeatureOverrides',
    JSON.stringify({ 'gl-live-tours': true, 'live-tour-editing-v2': true })
  )
);
await page.reload();
try {
  await page.waitForFunction(
    () =>
      !!window.__liveTourRun && !!document.querySelector('[title="Open Menu"]'),
    null,
    { timeout: 120_000 }
  );
} catch {
  console.error(
    `The board at ${base} never became ready. Is vite-verify running?`
  );
  await browser.close();
  process.exit(2);
}
// The dummy backend must never be a real project.
const project = await page.evaluate(() => window.__liveTourRun.project);
if (project !== 'dummy') {
  console.error(
    `Refusing to run: the server uses Firebase project "${project}". Use vite-verify.`
  );
  await browser.close();
  process.exit(2);
}

await page.evaluate((v) => window.__liveTourRun.start(v), view);
const deadline = Date.now() + STEP_MS * Math.max(view.steps.length, 1);
let state = null;
while (Date.now() < deadline) {
  state = await page.evaluate(() => window.__liveTourRun.state());
  if (state?.done) break;
  await sleep(500);
}
await page.screenshot({ path: join(out, 'end.png') });
await browser.close();

const results = view.steps.map((step, index) => {
  const r = state?.results?.[index];
  const status = r?.status ?? 'not reached';
  let picture;
  if (r?.picture) {
    picture = `step-${String(index + 1).padStart(2, '0')}-${step.id}.png`;
    writeFileSync(
      join(out, picture),
      Buffer.from(r.picture.split(',')[1], 'base64')
    );
  }
  return {
    step: index + 1,
    step_id: step.id,
    anchor: step.tour?.anchor ?? '',
    status,
    ...(r?.handedBack ? { handed_back: true } : {}),
    ...(picture ? { picture, w: r.w, h: r.h } : {}),
  };
});
const passed =
  !!state?.finished &&
  results.every((r) => r.status === 'found' || r.status === 'plain');
const report = {
  set_id: view.set_id,
  passed,
  finished: !!state?.finished,
  results,
  page_errors: errors,
};

if (upload) {
  const pictures = results
    .filter((r) => r.picture)
    .map((r) => ({
      step_id: r.step_id,
      image: `data:image/png;base64,${readFileSync(join(out, r.picture)).toString('base64')}`,
      w: r.w,
      h: r.h,
    }));
  report.upload = { saved: [], skipped: [] };
  for (let i = 0; i < pictures.length; i += 8) {
    const res = await fetch(upload, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, pictures: pictures.slice(i, i + 8) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      report.upload.error = body.error ?? `HTTP ${res.status}`;
      break;
    }
    report.upload.saved.push(...body.saved);
    report.upload.skipped.push(...body.skipped);
  }
}

writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2));
for (const r of results)
  console.log(
    `${r.status === 'found' || r.status === 'plain' ? 'ok  ' : 'FAIL'} ${r.step}. ${r.step_id} ${r.anchor || '(no control)'}: ${r.status}${r.handed_back ? ' (left to the teacher)' : ''}`
  );
if (report.upload)
  console.log(
    report.upload.error
      ? `upload failed: ${report.upload.error}`
      : `uploaded ${report.upload.saved.length} pictures`
  );
console.log(`${passed ? 'PASSED' : 'FAILED'}; results in ${out}`);
process.exit(passed ? 0 : 1);
