// Web tour playback benchmark: records each scenario's clues, plays it through the real extension, and times every step change.
// Usage: node scripts/build.ts --bench && node scripts/bench/run.ts --label=baseline [--runs=3] [--throttle=1,4] [--only=basic,heavy] [--video]
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  type BrowserContext,
  type Frame,
  type Page,
  type Worker,
} from '@playwright/test';
import { SCENARIOS, type BenchScenario } from './scenarios.ts';
import { LAUNCHER, OTHER_PORT, SITE, startServers } from './server.ts';
import type { WebTourStartMessage } from '../../../components/tours/web/extensionProtocol.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// SB_BENCH_EXT plays another build, e.g. a copy of the bench build from before a change.
const EXT = process.env.SB_BENCH_EXT ?? path.join(HERE, '../../dist/bench');
const CAPTURE = path.join(EXT, 'bench-capture.js');
const RESULTS = path.join(HERE, 'results');
/** How long the "teacher" reads a lit step before clicking it. */
const DWELL_MS = 500;
const STEP_TIMEOUT_MS = 8000;
const VIEWPORT = { width: 1366, height: 768 };
/** A step is lit when the overlay commits a spotlight box to the page, in the frame it is then painted. */
const LIT = 'paint';

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ??
  fallback;
const flag = (name: string) => process.argv.includes(`--${name}`);

interface Mark {
  name: string;
  t: number;
  token?: string;
  ms?: number;
  kind?: string;
  status?: string;
  current?: number;
  rect?: { x: number; y: number; width: number; height: number } | null;
  spot?: boolean;
  plain?: boolean;
}

export interface Transition {
  step: number;
  /** Step 1 only: from the tour page starting to load to its first spotlight. */
  firstLit?: number | null;
  actToSeek: number | null;
  seekToMatch: number | null;
  matchToLit: number | null;
  actToLit: number | null;
  /** From the target's content arriving (a page's `ready` mark, else the click) to the lit step. */
  readyToLit: number | null;
  /** Time the spotlight was gone between the click and the next lit step. */
  dark: number;
  /** Time the tip sat centred, away from any target, between the click and the next lit step. */
  centred: number;
  runs: number;
  runMsTotal: number;
  runMsMax: number;
  longTaskMs: number;
  maxFrameGap: number;
  fellBack: boolean;
}

const INIT = () => {
  const log = (o: Record<string, unknown>) =>
    console.debug(`[sbmain] ${JSON.stringify(o)}`);
  addEventListener(
    'pointerdown',
    (e) => log({ name: 'down', t: performance.timeOrigin + e.timeStamp }),
    true
  );
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        log({
          name: 'longtask',
          t: performance.timeOrigin + e.startTime,
          ms: e.duration,
        });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // No long task timing in this frame.
  }
  if (window === window.top) {
    log({ name: 'nav', t: performance.timeOrigin });
    const gaps: [number, number][] = [];
    let last = 0;
    const tick = (ts: number) => {
      if (last && ts - last > 20)
        gaps.push([performance.timeOrigin + last, ts - last]);
      last = ts;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as unknown as { __sbGaps: [number, number][] }).__sbGaps = gaps;
  }
};

const frameUrl = (id: 'ed' | 'wd') =>
  id === 'ed'
    ? `${SITE}/editor.html`
    : `https://127.0.0.1:${OTHER_PORT}/widget.html`;

function frameOf(page: Page, id?: 'ed' | 'wd'): Frame {
  if (!id) return page.mainFrame();
  const f = page.frames().find((fr) => fr.url().startsWith(frameUrl(id)));
  if (!f) throw new Error(`frame ${id} not loaded`);
  return f;
}

async function record(
  ctx: BrowserContext,
  sc: BenchScenario
): Promise<WebTourStartMessage> {
  const page = await ctx.newPage();
  await page.goto(SITE + sc.start);
  const steps: WebTourStartMessage['tour']['steps'] = [];
  for (const [i, st] of sc.steps.entries()) {
    if (st.frame)
      await page.waitForFunction(
        (u) =>
          [...document.querySelectorAll('iframe')].some((f) =>
            f.src.startsWith(u)
          ),
        frameUrl(st.frame)
      );
    const frame = st.frame
      ? await (async () => {
          for (let n = 0; n < 50; n++) {
            try {
              return frameOf(page, st.frame);
            } catch {
              await page.waitForTimeout(100);
            }
          }
          return frameOf(page, st.frame);
        })()
      : page.mainFrame();
    const loc = frame.locator(st.target).first();
    await loc.waitFor({ state: 'visible' });
    await loc.scrollIntoViewIfNeeded();
    if (!(await frame.evaluate(() => '__sbCapture' in globalThis)))
      await frame.addScriptTag({ path: CAPTURE });
    const clues = await loc.evaluate((el) =>
      (
        globalThis as unknown as {
          __sbCapture: (e: Element) => Record<string, unknown>;
        }
      ).__sbCapture(el)
    );
    const pathPattern = st.path ?? sc.start;
    steps.push({
      id: `s${i}`,
      label: `Step ${i + 1}`,
      text: `Click the highlighted control (${sc.name} ${i + 1}).`,
      web: {
        urlPattern: SITE + pathPattern,
        action: 'click',
        locator: {
          ...clues,
          ...(st.frame
            ? {
                frames: [
                  {
                    urlPattern: frameUrl(st.frame),
                    index: st.frame === 'ed' ? 0 : 1,
                  },
                ],
              }
            : {}),
        },
      },
    });
    await loc.click();
  }
  await page.close();
  return {
    type: 'web-tour/start',
    startUrl: SITE + sc.start,
    stepIndex: 0,
    tour: {
      setId: `bench-${sc.name}`,
      version: 1,
      title: `Bench ${sc.name}`,
      steps,
    },
  };
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(what)), ms)
    ),
  ]);

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const DEBUG_PORT = 9333;

/** The browser's own debugging socket, which can stop the extension's worker the way Chrome does when it idles. */
async function browserDebugger() {
  const version = (await (
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
  ).json()) as { webSocketDebuggerUrl: string };
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown };
    if (m.id !== undefined) pending.get(m.id)?.(m.result);
  };
  const send = <T>(method: string, params: Record<string, unknown> = {}) =>
    new Promise<T>((r) => {
      const n = ++id;
      pending.set(n, r as (v: unknown) => void);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return {
    async stopWorker() {
      const { targetInfos } = await send<{
        targetInfos: { targetId: string; type: string; url: string }[];
      }>('Target.getTargets');
      const sw = targetInfos.find(
        (t) =>
          t.type === 'service_worker' && t.url.startsWith('chrome-extension://')
      );
      if (sw) await send('Target.closeTarget', { targetId: sw.targetId });
    },
    close: () => ws.close(),
  };
}

let cold: Awaited<ReturnType<typeof browserDebugger>> | null = null;

async function play(
  ctx: BrowserContext,
  extId: string,
  sc: BenchScenario,
  msg: WebTourStartMessage,
  throttle: number
): Promise<Transition[]> {
  const launcher = await ctx.newPage();
  await launcher.goto(LAUNCHER);
  const marks: Mark[] = [];
  const start = async () => {
    const opened = ctx.waitForEvent('page', { timeout: 10000 });
    const reply: unknown = await withTimeout(
      launcher.evaluate(
        ([id, m]) =>
          (
            globalThis as unknown as { chrome: typeof chrome }
          ).chrome.runtime.sendMessage<unknown, unknown>(id, m),
        [extId, msg] as const
      ),
      10000,
      'no reply to the start message'
    );
    try {
      return await opened;
    } catch (err) {
      console.warn(
        `start of ${sc.name} opened no tab: ${JSON.stringify(reply)}`
      );
      throw err;
    }
  };
  const page = await start().catch(start);
  page.on('console', (c) => {
    const text = c.text();
    const m = /^\[sb(?:bench|main)\] (.*)$/.exec(text);
    if (m) marks.push(JSON.parse(m[1]) as Mark);
  });
  if (throttle > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  const waitFor = async <T>(fn: () => T | undefined, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v !== undefined) return v;
      await page.waitForTimeout(10);
    }
    return undefined;
  };
  const steps = sc.steps;
  const clicks: number[] = [];
  const fellBack: boolean[] = [];
  for (let i = 0; i < steps.length; i++) {
    const since = clicks[i - 1] ?? 0;
    const lit = await waitFor(() => {
      const match = marks.find(
        (m) =>
          m.name === 'match' && m.token?.startsWith(`${i}:`) && m.t >= since
      );
      if (!match) return undefined;
      return marks.find((m) => m.name === LIT && m.rect && m.t >= match.t);
    }, STEP_TIMEOUT_MS);
    fellBack.push(!lit);
    await page.waitForTimeout(DWELL_MS);
    // --cold: Chrome stops an idle extension worker after 30s, so a slow reader's click wakes a fresh one.
    if (cold) {
      await cold.stopWorker();
      await page.waitForTimeout(200);
    }
    const before = marks.length;
    const frame = frameOf(page, steps[i].frame);
    await frame.locator(steps[i].target).first().click({ timeout: 5000 });
    const down = await waitFor(
      () => marks.slice(before).find((m) => m.name === 'down'),
      2000
    );
    clicks.push(down?.t ?? Date.now());
  }
  await waitFor(
    () => marks.find((m) => m.name === 'render' && m.status === 'done'),
    STEP_TIMEOUT_MS
  );
  const gaps = await page.evaluate(
    () =>
      (window as unknown as { __sbGaps?: [number, number][] }).__sbGaps ?? []
  );
  await page.close();
  await launcher.close();
  if (flag('dump'))
    writeFileSync(
      path.join(os.tmpdir(), `sb-bench-marks-${sc.name}-${throttle}x.json`),
      JSON.stringify({ clicks, marks }, null, 1)
    );

  const out: Transition[] = [];
  const nav = marks.find((m) => m.name === 'nav');
  const firstMatch = marks.find(
    (m) => m.name === 'match' && m.token?.startsWith('0:')
  );
  const firstPaint = firstMatch
    ? marks.find((m) => m.name === LIT && m.rect && m.t >= firstMatch.t)
    : undefined;
  const firstLit = nav && firstPaint ? firstPaint.t - nav.t : null;
  for (let i = 1; i < steps.length; i++) {
    const act = clicks[i - 1];
    const tok = (m: Mark) => m.token?.startsWith(`${i}:`) && m.t >= act;
    const seek = marks.find((m) => m.name === 'seek' && tok(m));
    const match = marks.find((m) => m.name === 'match' && tok(m));
    const lit = match
      ? marks.find((m) => m.name === LIT && m.rect && m.t >= match.t)
      : undefined;
    const end = lit?.t ?? clicks[i];
    // Time a view flag was true inside [act, end], from the overlay's 'view' marks.
    const during = (key: 'spot' | 'plain', want: boolean) => {
      const views = marks.filter((m) => m.name === 'view');
      let on = views.filter((m) => m.t < act).at(-1)?.[key] === want;
      let from = act;
      let total = 0;
      for (const v of views.filter((m) => m.t >= act && m.t <= end)) {
        if (on) total += v.t - from;
        on = v[key] === want;
        from = v.t;
      }
      return on ? total + (end - from) : total;
    };
    const runs = marks.filter((m) => m.name === 'run' && tok(m));
    const ready = marks.find(
      (m) => m.name === 'ready' && m.t >= act && m.t <= end
    );
    const winEnd = end + 300;
    out.push({
      step: i,
      ...(i === 1 ? { firstLit } : {}),
      actToSeek: seek ? seek.t - act : null,
      seekToMatch: seek && match ? match.t - seek.t : null,
      matchToLit: match && lit ? lit.t - match.t : null,
      actToLit: lit ? lit.t - act : null,
      readyToLit: lit ? lit.t - Math.max(act, ready?.t ?? act) : null,
      dark: lit ? during('spot', false) : 0,
      centred: lit ? during('plain', true) : 0,
      runs: runs.length,
      runMsTotal: runs.reduce((s, r) => s + (r.ms ?? 0), 0),
      runMsMax: Math.max(0, ...runs.map((r) => r.ms ?? 0)),
      longTaskMs: marks
        .filter((m) => m.name === 'longtask' && m.t >= act && m.t <= winEnd)
        .reduce((s, m) => s + (m.ms ?? 0), 0),
      maxFrameGap: Math.max(
        0,
        ...gaps.filter(([t]) => t >= act && t <= winEnd).map(([, d]) => d)
      ),
      fellBack: fellBack[i],
    });
  }
  return out;
}

export interface ScenarioResult {
  scenario: string;
  throttle: number;
  transitions: Transition[];
}

export function summarize(rows: Transition[]) {
  const lit = rows
    .map((r) => r.actToLit)
    .filter((x): x is number => x !== null);
  return {
    transitions: rows.length,
    fellBack: rows.filter((r) => r.fellBack).length,
    actToLitMedian: median(lit),
    actToLitP95: pct(lit, 95),
    readyToLitMedian: median(
      rows.map((r) => r.readyToLit).filter((x): x is number => x !== null)
    ),
    readyToLitP95: pct(
      rows.map((r) => r.readyToLit).filter((x): x is number => x !== null),
      95
    ),
    darkMedian: median(rows.map((r) => r.dark)),
    darkP95: pct(
      rows.map((r) => r.dark),
      95
    ),
    centredP95: pct(
      rows.map((r) => r.centred),
      95
    ),
    runMsP95: pct(
      rows.map((r) => r.runMsMax),
      95
    ),
    longTaskMsTotal: rows.reduce((s, r) => s + r.longTaskMs, 0),
    maxFrameGapP95: pct(
      rows.map((r) => r.maxFrameGap),
      95
    ),
    firstLitMedian: median(
      rows
        .map((r) => r.firstLit)
        .filter((x): x is number => typeof x === 'number')
    ),
  };
}

/** CI limits (--budget) at 1x CPU: loose enough for a shared runner, tight enough to catch the old hitches coming back. */
export const BUDGETS = {
  /** Click to the next spotlight. */
  actToLitP95: 200,
  /** Content arriving to its spotlight. */
  readyToLitP95: 200,
  /** One search, at its worst (the gradebook took 60-90ms before). */
  runMsP95: 60,
  /** Longest frame the page skipped around a step change. */
  maxFrameGapP95: 150,
  /** Time the spotlight blinked out between steps. */
  darkP95: 150,
} as const;

type Budget = Record<keyof typeof BUDGETS, number>;

/** Scenarios held to their own limits: late content used to wait 250ms more and blank the spotlight for a second. */
const SCENARIO_BUDGETS: Record<string, Partial<Budget>> = {
  spa: { readyToLitP95: 120, darkP95: 300 },
};

function overBudget(results: ScenarioResult[]): string[] {
  const out: string[] = [];
  for (const r of results) {
    const s = summarize(r.transitions);
    if (s.fellBack > 0)
      out.push(`${r.scenario}: ${s.fellBack} steps fell back to the picture`);
    const limits: Budget = { ...BUDGETS, ...SCENARIO_BUDGETS[r.scenario] };
    for (const [key, limit] of Object.entries(limits) as [
      keyof Budget,
      number,
    ][]) {
      // Spa content arrives late on purpose, so its click time is the app's, not ours.
      if (key === 'actToLitP95' && r.scenario === 'spa') continue;
      const v = s[key];
      if (v > limit)
        out.push(
          `${r.scenario} ${r.throttle}x: ${key} ${v.toFixed(0)}ms > ${limit}ms`
        );
    }
  }
  return out;
}

/** How long one play may take before its browser is presumed hung and replaced. */
const PLAY_TIMEOUT_MS = 120_000;

async function launch(label: string) {
  const profile = path.join(os.tmpdir(), `sb-bench-profile-${Date.now()}`);
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: !flag('headed'),
    channel: 'chromium',
    // A browser other than Playwright's own, e.g. a preinstalled Chromium (SB_BENCH_CHROMIUM).
    ...(process.env.SB_BENCH_CHROMIUM
      ? { executablePath: process.env.SB_BENCH_CHROMIUM }
      : {}),
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
    ...(flag('video')
      ? {
          recordVideo: {
            dir: path.join(RESULTS, `video-${label}`),
            size: VIEWPORT,
          },
        }
      : {}),
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--ignore-certificate-errors',
      ...(flag('cold') ? [`--remote-debugging-port=${DEBUG_PORT}`] : []),
    ],
  });
  await ctx.addInitScript(INIT);
  const sw: Worker =
    ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  cold = flag('cold') ? await browserDebugger() : null;
  return { ctx, extId: new URL(sw.url()).host };
}

async function close(ctx: BrowserContext) {
  cold?.close();
  cold = null;
  await withTimeout(ctx.close(), 15_000, 'browser did not close').catch(
    () => undefined
  );
}

async function main() {
  const label = arg('label', 'run');
  const runs = Number(arg('runs', '3'));
  const throttles = arg('throttle', '1,4').split(',').map(Number);
  const only = arg('only', '');
  const scenarios = only
    ? SCENARIOS.filter((s) => only.split(',').includes(s.name))
    : SCENARIOS;
  const stop = await startServers();
  try {
    const results: ScenarioResult[] = [];
    // A fresh browser per scenario, so one scenario's leftovers never slow the next.
    for (const sc of scenarios) {
      let { ctx, extId } = await launch(label);
      const msg = await record(ctx, sc);
      for (const throttle of throttles) {
        const transitions: Transition[] = [];
        const attempt = () => {
          const run = play(ctx, extId, sc, msg, throttle);
          // A play abandoned on timeout fails later, once its browser is closed.
          run.catch(() => undefined);
          return withTimeout(run, PLAY_TIMEOUT_MS, 'play timed out');
        };
        for (let r = 0; r < runs; r++) {
          try {
            transitions.push(...(await attempt()));
          } catch (err) {
            console.warn(
              `${sc.name} ${throttle}x run ${r + 1} failed (${String(err)}); retrying in a new browser`
            );
            await close(ctx);
            ({ ctx, extId } = await launch(label));
            transitions.push(...(await attempt()));
          }
        }
        results.push({ scenario: sc.name, throttle, transitions });
        const s = summarize(transitions);
        console.log(
          `${sc.name.padEnd(7)} ${throttle}x  click->lit median ${s.actToLitMedian.toFixed(0)}ms p95 ${s.actToLitP95.toFixed(0)}ms  ready->lit p95 ${s.readyToLitP95.toFixed(0)}ms  dark p95 ${s.darkP95.toFixed(0)}ms  centred p95 ${s.centredP95.toFixed(0)}ms  search p95 ${s.runMsP95.toFixed(1)}ms  long tasks ${s.longTaskMsTotal.toFixed(0)}ms  frame gap p95 ${s.maxFrameGapP95.toFixed(0)}ms  first step ${s.firstLitMedian.toFixed(0)}ms  fell back ${s.fellBack}/${s.transitions}`
        );
      }
      await close(ctx);
    }
    mkdirSync(RESULTS, { recursive: true });
    const file = path.join(RESULTS, `${label}.json`);
    writeFileSync(
      file,
      `${JSON.stringify({ label, runs, at: new Date().toISOString(), results }, null, 2)}\n`
    );
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
    if (flag('budget')) {
      const over = overBudget(results);
      for (const line of over) console.error(`Over budget: ${line}`);
      if (over.length) process.exitCode = 1;
      else console.log('Every scenario is within its budget.');
    }
  } finally {
    await stop();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
