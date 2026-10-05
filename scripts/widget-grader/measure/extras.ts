// Drives the harness for the S7 criteria (I3, I4, I5, V2, V5, C4, C6, R1, R2, R3, R5) on one widget.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import type { Measurement } from '../types';
import { HARNESS_STATES } from '../../../components/dev/widgetGrader/harnessParams';
import {
  CONTROL_SELECTOR,
  DRAG_BLOCKING_SELECTOR,
  GRID_COLS,
  GRID_ROWS,
  REPO_ROOT,
} from './constants';
import {
  collectAnimations,
  collectClutter,
  collectControlVisibility,
  collectDestructive,
  collectFaceState,
  collectPanelControls,
  collectTabbables,
  collectTheming,
  countDoubleClickHandlers,
  findDragPoint,
  focusStop,
  stampFocusBaseline,
  type FaceState,
  type TabStop,
} from './extrasCollect';
import {
  summarizeExtras,
  type AxeViolation,
  type ExtrasRaw,
} from './extrasLevels';
import {
  renderSizes,
  windowId,
  windowSelector,
  type HarnessQuery,
} from './harness';
import { ErrorLog, openHarness } from './measureWidget';

const SETTLE_MS = 400;
const IDLE_WINDOW_MS = 600;
const TIMER_WINDOW_MS = 1500;
const MAX_HOVER_CHECKS = 20;
const MAX_SETTINGS = 12;
const MAX_DESTRUCTIVE = 3;
const MAX_TABS = 60;
const FAST_INTERVAL_MS = 1000;
const STEP_TIMEOUT_MS = 5000;

// axe-core ships with jest-axe, so the measurer needs no new dependency.
const axeSource = (): string | null => {
  try {
    const fromJestAxe = createRequire(
      createRequire(`${REPO_ROOT}/package.json`).resolve('jest-axe')
    );
    return readFileSync(fromJestAxe.resolve('axe-core/axe.min.js'), 'utf8');
  } catch {
    return null;
  }
};
let cachedAxe: string | null | undefined;

const commits = (page: Page, id: string): Promise<number> =>
  page.evaluate((w) => window.__widgetGrader?.commits[w] ?? 0, id);

const faceShot = async (page: Page, type: string): Promise<Buffer | null> => {
  const card = page.locator(windowSelector(type));
  return (await card.count())
    ? card
        .screenshot({ timeout: 3000, animations: 'disabled' })
        .catch(() => null)
    : null;
};

const faceText = (page: Page, type: string, instance = 1): Promise<string> =>
  page
    .locator(windowSelector(type, instance))
    .innerText({ timeout: 3000 })
    .then((t) => t.replace(/\s+/g, ' ').trim())
    .catch(() => '');

const same = (a: Buffer | null, b: Buffer | null): boolean =>
  !!a && !!b && a.equals(b);

async function hoverOnly(page: Page, widgetId: string): Promise<string[]> {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(150);
  const before = await page.evaluate(collectControlVisibility, {
    widgetId,
    controlSelector: CONTROL_SELECTOR,
  });
  const out: string[] = [];
  const hidden = before
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.hidden)
    .slice(0, MAX_HOVER_CHECKS);
  for (const c of hidden) {
    await page.mouse.move(c.x, c.y);
    await page.waitForTimeout(200);
    const after = await page.evaluate(collectControlVisibility, {
      widgetId,
      controlSelector: CONTROL_SELECTOR,
    });
    if (after[c.i] && !after[c.i].hidden) out.push(c.path);
  }
  await page.mouse.move(1, 1);
  return out;
}

async function keyboard(page: Page, widgetId: string) {
  const { unreachable } = await page.evaluate(collectTabbables, {
    widgetId,
    controlSelector: CONTROL_SELECTOR,
  });
  await page.evaluate(stampFocusBaseline, widgetId);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const stops: TabStop[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(focusStop, widgetId);
    if (!stop) {
      if (stops.length) break;
      continue;
    }
    const key = `${stop.path}@${Math.round(stop.x)},${Math.round(stop.y)}`;
    if (seen.has(key)) break;
    seen.add(key);
    stops.push(stop);
  }
  if (cachedAxe === undefined) cachedAxe = axeSource();
  let axe: AxeViolation[] | null = null;
  if (cachedAxe) {
    await page.addScriptTag({ content: cachedAxe });
    axe = await page.evaluate(async (id) => {
      const root = document.querySelector(
        `[data-draggable-window][data-widget-id="${id}"]`
      );
      const api = (
        window as unknown as {
          axe: {
            run: (
              ctx: Element,
              opts: unknown
            ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
          };
        }
      ).axe;
      if (!root) return [];
      const result = await api.run(root, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        },
        // S5 grades contrast against the board background.
        rules: { 'color-contrast': { enabled: false } },
        resultTypes: ['violations'],
      });
      return result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      }));
    }, widgetId);
  }
  return { unreachable, stops, axe };
}

async function settingsChanges(
  page: Page,
  type: string,
  base: HarnessQuery
): Promise<ExtrasRaw['settings']> {
  const widgetId = windowId(type);
  await openHarness(page, { ...base, settingsOpen: true });
  const panel = page.locator(
    `[data-widget-portal][data-widget-id="${widgetId}"] .overflow-y-auto`
  );
  if ((await panel.count()) === 0)
    return { hasPanel: false, panelOverlap: 0, tried: [] };
  const controls = (await page.evaluate(collectPanelControls, widgetId)).slice(
    0,
    MAX_SETTINGS
  );
  const panelBox = await page
    .locator(`[data-widget-portal][data-widget-id="${widgetId}"]`)
    .first()
    .boundingBox();
  const cardBox = await page.locator(windowSelector(type)).boundingBox();
  let panelOverlap = 0;
  if (panelBox && cardBox) {
    const w =
      Math.min(panelBox.x + panelBox.width, cardBox.x + cardBox.width) -
      Math.max(panelBox.x, cardBox.x);
    const h =
      Math.min(panelBox.y + panelBox.height, cardBox.y + cardBox.height) -
      Math.max(panelBox.y, cardBox.y);
    panelOverlap =
      w > 0 && h > 0 ? (w * h) / (cardBox.width * cardBox.height) : 0;
  }
  const all = panel
    .first()
    .locator(
      'button, input, select, textarea, [role="switch"], [role="radio"], [role="checkbox"]'
    );
  const tried: ExtrasRaw['settings']['tried'] = [];
  for (const c of controls) {
    const el = all.nth(c.index);
    const beforeText = await faceText(page, type);
    const beforeShot = await faceShot(page, type);
    try {
      if (c.kind === 'select') {
        const values = await el.evaluate((s) =>
          Array.from((s as HTMLSelectElement).options).map((o) => o.value)
        );
        const current = await el.inputValue();
        const next = values.find((v) => v !== current);
        if (next === undefined) continue;
        await el.selectOption(next, { timeout: 2000 });
      } else if (c.kind === 'range') {
        await el.focus();
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
      } else if (c.kind === 'number') {
        const v = Number(await el.inputValue()) || 0;
        await el.fill(String(v + 1), { timeout: 2000 });
      } else if (c.kind === 'text') {
        const v = await el.inputValue();
        await el.fill(`${v} Grader`, { timeout: 2000 });
      } else {
        await el.click({ timeout: 2000 });
      }
    } catch {
      continue;
    }
    await page.waitForTimeout(SETTLE_MS);
    // Some controls open dialogs; close them so the next control is reachable.
    if (
      (await page.locator('[role="dialog"], [role="alertdialog"]').count()) > 0
    )
      await page.keyboard.press('Escape');
    const changed =
      (await faceText(page, type)) !== beforeText ||
      !same(beforeShot, await faceShot(page, type));
    tried.push({ label: c.label, kind: c.kind, changed });
    if ((await panel.count()) === 0) break;
  }
  return { hasPanel: true, panelOverlap, tried };
}

async function destructive(
  page: Page,
  type: string,
  base: HarnessQuery
): Promise<ExtrasRaw['destructive']> {
  const widgetId = windowId(type);
  await openHarness(page, base);
  const found = (
    await page.evaluate(collectDestructive, {
      widgetId,
      controlSelector: CONTROL_SELECTOR,
    })
  ).slice(0, MAX_DESTRUCTIVE);
  const out: ExtrasRaw['destructive'] = [];
  for (const d of found) {
    await openHarness(page, base);
    const before = await faceText(page, type);
    const el = page
      .locator(windowSelector(type))
      .locator(CONTROL_SELECTOR)
      .nth(d.index);
    try {
      await el.click({ timeout: 2000 });
    } catch {
      continue;
    }
    await page.waitForTimeout(SETTLE_MS);
    const confirmed =
      (await page.locator('[role="dialog"], [role="alertdialog"]').count()) > 0;
    const after = await faceText(page, type);
    const undo = /\bundo\b/i.test(
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    );
    out.push({
      label: d.label,
      confirmed: confirmed || undo,
      changed: after !== before,
    });
  }
  return out;
}

async function perfAndMulti(
  page: Page,
  type: string,
  base: HarnessQuery,
  errors: ErrorLog
): Promise<{
  perf: Omit<ExtrasRaw['perf'], 'fastIntervals' | 'animates' | 'chunkBytes'>;
  multi: ExtrasRaw['multi'];
}> {
  await errors.check(page);
  await openHarness(page, { ...base, count: 2 });
  const first = windowId(type, 1);
  const second = windowId(type, 2);
  const rendered = (await page.locator(windowSelector(type, 2)).count()) > 0;
  const reset = () =>
    page.evaluate(() => {
      if (window.__widgetGrader) window.__widgetGrader.commits = {};
    });
  await reset();
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const idleCommits = await commits(page, first);

  let dragCommits: number | null = null;
  const point = await page.evaluate(findDragPoint, {
    widgetId: second,
    dragBlockingSelector: DRAG_BLOCKING_SELECTOR,
  });
  if (point) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 10, point.y + 10, { steps: 2 });
    await page.waitForTimeout(100);
    await reset();
    await page.mouse.move(point.x + 200, point.y + 120, { steps: 20 });
    await page.waitForTimeout(IDLE_WINDOW_MS - 100);
    dragCommits = Math.max(0, (await commits(page, first)) - idleCommits);
    await page.mouse.up();
    await page.waitForTimeout(SETTLE_MS);
  }

  let resizeCommits: number | null = null;
  const handle = page
    .locator(windowSelector(type, 1))
    .locator('.resize-handle.cursor-se-resize');
  if ((await handle.count()) > 0) {
    const b = await handle.first().boundingBox();
    if (b) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + 120, b.y + 80, { steps: 8 });
      await page.mouse.up();
      await reset();
      await page.waitForTimeout(IDLE_WINDOW_MS);
      resizeCommits = Math.max(0, (await commits(page, first)) - idleCommits);
    }
  }

  // R5: acting on the first instance must not change the second.
  let secondChanged: boolean | null = null;
  if (rendered) {
    const before = await faceText(page, type, 2);
    const target = page
      .locator(windowSelector(type, 1))
      .locator('button:not([aria-label*="elete"]):not([aria-label*="emove"])')
      .first();
    if ((await target.count()) > 0) {
      const clicked = await target
        .click({ timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        await page.waitForTimeout(SETTLE_MS);
        if ((await page.locator('[role="dialog"]').count()) > 0)
          await page.keyboard.press('Escape');
        secondChanged = (await faceText(page, type, 2)) !== before;
      }
    }
  }
  const multiErrors = (await errors.drain(page)).length;
  errors.takeNetwork();
  return {
    perf: { idleCommits, dragCommits, resizeCommits },
    multi: { rendered, errors: multiErrors, secondChanged },
  };
}

export interface ExtrasOptions {
  chunkBytes: number | null;
  g4Pass: boolean | null;
  partial?: string;
}

export async function measureExtras(
  page: Page,
  type: string,
  opts: ExtrasOptions
): Promise<Measurement[]> {
  const errors = new ErrorLog(page);
  // Controls can vanish as settings change; no single step may stall the widget's run.
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(30_000);
  const widgetId = windowId(type);
  let mark = Date.now();
  const trace = (step: string) => {
    if (process.env.GRADER_TRACE)
      console.log(
        `${type} ${step} ${((Date.now() - mark) / 1000).toFixed(1)}s`
      );
    mark = Date.now();
  };
  const size = renderSizes(type).find((s) => s.name === 'default')!;
  const base: HarnessQuery = {
    type,
    fixture: 'typical',
    w: size.width,
    h: size.height,
  };

  await openHarness(page, base);
  const clutter = await page.evaluate(collectClutter, {
    widgetId,
    controlSelector: CONTROL_SELECTOR,
  });
  const normal = await page.evaluate(collectAnimations, widgetId);
  const doubleClick = await page.evaluate(countDoubleClickHandlers, widgetId);
  const intervals = await page.evaluate(() =>
    Object.values(window.__widgetGrader?.intervals ?? {})
  );
  const shotA = await faceShot(page, type);
  await page.waitForTimeout(TIMER_WINDOW_MS);
  const animates = !same(shotA, await faceShot(page, type));
  trace('face');
  const hover = await hoverOnly(page, widgetId);
  trace('hover');
  const kb = await keyboard(page, widgetId);
  trace('keyboard');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHarness(page, base);
  const reduced = await page.evaluate(collectAnimations, widgetId);
  await page.emulateMedia({ reducedMotion: null });

  await openHarness(page, { ...base, style: 'alt' });
  const theming = await page.evaluate(collectTheming, {
    widgetId,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
  });
  trace('motion+theming');

  const states: Record<string, FaceState> = {};
  for (const state of HARNESS_STATES) {
    await openHarness(page, { ...base, state });
    states[state] = await page.evaluate(collectFaceState, {
      widgetId,
      controlSelector: CONTROL_SELECTOR,
    });
  }
  // Forced states may log on purpose; they are not G3 runs.
  await errors.drain(page);
  trace('states');

  const settings = await settingsChanges(page, type, base);
  trace('settings');
  const destroyed = await destructive(page, type, base);
  trace('destructive');
  const { perf, multi } = await perfAndMulti(page, type, base, errors);
  trace('perf+multi');

  const raw: ExtrasRaw = {
    controls: clutter.visibleControls,
    clutter,
    hoverOnly: hover,
    doubleClick,
    keyboard: kb,
    motion: { normal, reduced },
    theming,
    settings,
    states,
    destructive: destroyed,
    perf: {
      ...perf,
      fastIntervals: intervals.filter((d) => d < FAST_INTERVAL_MS),
      animates: animates || normal.running > 0,
      chunkBytes: opts.chunkBytes,
    },
    multi,
  };
  return summarizeExtras(type, raw, opts.g4Pass, opts.partial);
}
