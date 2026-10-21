#!/usr/bin/env node
// Plays a live tour on the dummy-backend board and reports each step (LIVE_TOUR_ONE_SHOT.md D7, D12).
// Usage: node scripts/run-live-tour.mjs <tour.json> [--base http://localhost:56320] [--out dir]
//        [--upload <upload_url> --ticket <ticket>] [--flags id,id]
// <tour.json> is what get_live_tour returned. Start the server first: vite-verify, or pnpm run dev:verify.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installedChromiums } from './lib/findChromium.mjs';

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

// LIVE_TOUR_CHROMIUM wins; else Playwright's expected build, the machine's Chrome, then any installed Chromium.
async function launchBrowser() {
  const forced = process.env.LIVE_TOUR_CHROMIUM;
  if (forced) return chromium.launch({ executablePath: forced });
  const tried = [];
  const attempts = [
    ["Playwright's Chromium", {}],
    ['Chrome', { channel: 'chrome' }],
    ...installedChromiums().map((p) => [p, { executablePath: p }]),
  ];
  for (const [name, options] of attempts) {
    try {
      const b = await chromium.launch(options);
      if (tried.length) console.error(`Using ${name}.`);
      return b;
    } catch (err) {
      tried.push(`${name}: ${String(err.message).split('\n')[0]}`);
    }
  }
  console.error(
    `No Chromium would launch. Tried:\n  ${tried.join('\n  ')}\nSet LIVE_TOUR_CHROMIUM to a Chromium or headless shell executable, or run pnpm exec playwright install chromium.`
  );
  process.exit(2);
}
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
// Any file chooser a step opens (Add media) gets the bundled sample image.
const sampleImage = fileURLToPath(
  new URL('./live-tour-assets/sample-image.png', import.meta.url)
);
page.on('filechooser', (chooser) =>
  chooser.setFiles(sampleImage).catch((err) => errors.push(err.message))
);

await page.goto(base);
// Extra preview flags to play the tour with, such as live-tour-self-heal.
const flags = Object.fromEntries(
  ['live-tour-editing-v2', ...(flag('flags')?.split(',') ?? [])]
    .filter(Boolean)
    .map((id) => [id, true])
);
await page.evaluate(
  (f) => localStorage.setItem('authBypassFeatureOverrides', JSON.stringify(f)),
  flags
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
    // The editor's crop: WebP where the browser can encode it, else PNG.
    const ext = /^data:image\/(\w+);/.exec(r.picture)?.[1] ?? 'png';
    picture = `step-${String(index + 1).padStart(2, '0')}-${step.id}.${ext}`;
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
    ...(r?.noOption ? { no_option: true } : {}),
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
      image: `data:image/${r.picture.split('.').pop()};base64,${readFileSync(join(out, r.picture)).toString('base64')}`,
      w: r.w,
      h: r.h,
    }));
  report.upload = { saved: [], skipped: [] };
  // Up to 8 pictures and about 6 MB per request, well under the function's body limit.
  const batches = [];
  for (const p of pictures) {
    const last = batches.at(-1);
    const size = last?.reduce((n, q) => n + q.image.length, 0) ?? Infinity;
    if (!last || last.length >= 8 || size + p.image.length > 6_000_000)
      batches.push([p]);
    else last.push(p);
  }
  for (const batch of batches) {
    let res;
    try {
      res = await fetch(upload, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket, pictures: batch }),
      });
    } catch (err) {
      // Behind a proxy, Node needs NODE_USE_ENV_PROXY=1 and NODE_EXTRA_CA_CERTS (AUTHORING.md).
      report.upload.error = `${upload} unreachable: ${err.cause?.message ?? err.message}`;
      break;
    }
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
    `${r.status === 'found' || r.status === 'plain' ? 'ok  ' : 'FAIL'} ${r.step}. ${r.step_id} ${r.anchor || '(no control)'}: ${r.status}${r.handed_back ? ' (left to the teacher)' : ''}${r.no_option ? ' (no option matches the value)' : ''}`
  );
if (report.upload)
  console.log(
    report.upload.error
      ? `upload failed: ${report.upload.error}`
      : `uploaded ${report.upload.saved.length} pictures`
  );
console.log(`${passed ? 'PASSED' : 'FAILED'}; results in ${out}`);
process.exit(passed ? 0 : 1);
