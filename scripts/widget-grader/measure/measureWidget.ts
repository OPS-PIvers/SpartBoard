// Drives the harness through one widget's test matrix and returns its measurements.

import { mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Page } from '@playwright/test';
import { measureScrollEndGaps } from '../../../tests/e2e/helpers/scrollEndPadding';
import type { FixtureName, Measurement, MeasurementSize } from '../types';
import {
  analyzeG1,
  analyzeG2,
  analyzeG3,
  analyzeG4,
  renderMetrics,
} from './analyze';
import { collectFaceSnapshot } from './collect';
import {
  CONTROL_SELECTOR,
  DRAG_BLOCKING_SELECTOR,
  GRID_COLS,
  GRID_ROWS,
  INTERACTIVE_ELEMENTS_SELECTOR,
  REPO_ROOT,
  type Thresholds,
} from './constants';
import {
  harnessUrl,
  renderSizes,
  windowId,
  windowSelector,
  type HarnessQuery,
} from './harness';
import { summarize, type RenderRecord, type RenderVariant } from './levels';
import type { FaceSnapshot } from './snapshotTypes';

const READY_TIMEOUT_MS = 20_000;
const SETTLE_MS = 400;
const SHOT_PAD = 24;

export class HarnessUnsupported extends Error {}

export interface MeasureOptions {
  outDir: string;
  thresholds: Thresholds;
  fixtures: FixtureName[];
  /** Runs after the widget settles and before collection; the planted-failure check uses it. */
  beforeCollect?: (page: Page) => Promise<void>;
}

/** Collects console errors, page errors and harness messages since the last reset. */
export class ErrorLog {
  private items: string[] = [];
  /** Browser network-failure lines; recorded, not counted as widget errors. */
  private network: string[] = [];
  constructor(page: Page) {
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (msg.text().startsWith('Failed to load resource'))
        this.network.push(`${msg.text()} ${msg.location().url}`);
      else this.items.push(msg.text());
    });
    page.on('pageerror', (err) => this.items.push(err.message));
  }
  async drain(page: Page): Promise<string[]> {
    const harness = await page
      .evaluate(() => window.__widgetGrader?.errors ?? [])
      .catch(() => [] as string[]);
    const out = [
      ...this.items,
      ...harness.filter((e) => e.startsWith('Grader harness')),
    ];
    this.items = [];
    return out;
  }
  takeNetwork(): string[] {
    const out = this.network;
    this.network = [];
    return out;
  }
  async check(page: Page) {
    return analyzeG3(await this.drain(page), this.takeNetwork());
  }
}

export async function openHarness(
  page: Page,
  query: HarnessQuery
): Promise<void> {
  await page.goto(harnessUrl(query));
  await page.waitForSelector('[data-grader-ready="true"]', {
    timeout: READY_TIMEOUT_MS,
  });
  const message = page.locator('[data-grader-error]');
  if ((await message.count()) > 0)
    throw new HarnessUnsupported((await message.innerText()).trim());
}

export const snapshot = (
  page: Page,
  type: string,
  instance = 1
): Promise<FaceSnapshot> =>
  page.evaluate(collectFaceSnapshot, {
    widgetId: windowId(type, instance),
    dragBlockingSelector: DRAG_BLOCKING_SELECTOR,
    interactiveSelector: INTERACTIVE_ELEMENTS_SELECTOR,
    controlSelector: CONTROL_SELECTOR,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
  });

async function screenshot(
  page: Page,
  s: FaceSnapshot,
  file: string
): Promise<string> {
  const boxes = s.toolbar ? [s.card, s.toolbar] : [s.card];
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - SHOT_PAD);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - SHOT_PAD);
  const x1 = Math.min(
    s.viewport.w,
    Math.max(...boxes.map((b) => b.x + b.w)) + SHOT_PAD
  );
  const y1 = Math.min(
    s.viewport.h,
    Math.max(...boxes.map((b) => b.y + b.h)) + SHOT_PAD
  );
  await page.screenshot({
    path: file,
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  });
  return relative(REPO_ROOT, file);
}

const faceText = (page: Page, type: string, instance = 1): Promise<string> =>
  page
    .locator(windowSelector(type, instance))
    .innerText()
    .then((t) => t.replace(/\s+/g, ' ').trim());

export async function measureWidget(
  page: Page,
  type: string,
  opts: MeasureOptions
): Promise<Measurement[]> {
  const errors = new ErrorLog(page);
  // First 5 embeds a live page; a stub keeps renders stable and offline.
  await page.route(/edtomorrow\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>stub</title>',
    })
  );
  const shots = join(opts.outDir, 'screenshots', type);
  mkdirSync(shots, { recursive: true });
  const sizes = renderSizes(type);
  const records: RenderRecord[] = [];
  const texts: Partial<Record<FixtureName, string>> = {};

  const render = async (
    size: MeasurementSize,
    fixture: FixtureName,
    variant: RenderVariant
  ): Promise<void> => {
    await errors.check(page);
    await openHarness(page, {
      type,
      fixture,
      w: size.width,
      h: size.height,
      maximized: size.name === 'maximized-1920x1080',
      selected: variant === 'selected',
      settingsOpen: variant === 'settings',
    });
    await opts.beforeCollect?.(page);
    const s = await snapshot(page, type);
    const file = await screenshot(
      page,
      s,
      join(
        shots,
        `${size.name}__${fixture}${variant === 'base' ? '' : `__${variant}`}.png`
      )
    );
    if (variant === 'settings') {
      records.push({
        size,
        fixture,
        variant,
        g3: await errors.check(page),
        screenshot: file,
      });
      return;
    }
    const gaps =
      variant === 'base'
        ? (await measureScrollEndGaps(page.locator(windowSelector(type)))).map(
            (g) => g.gap
          )
        : [];
    if (variant === 'base' && size.name === 'default')
      texts[fixture] = s.faceText;
    records.push({
      size,
      fixture,
      variant,
      g1: variant === 'base' ? analyzeG1(s) : undefined,
      g2: variant === 'base' ? analyzeG2(s) : undefined,
      g3: await errors.check(page),
      metrics: renderMetrics(s, opts.thresholds),
      scrollEndGaps: gaps,
      screenshot: file,
    });
  };

  for (const fixture of opts.fixtures)
    for (const size of sizes) await render(size, fixture, 'base');
  const defaultSize = sizes.find((s) => s.name === 'default')!;
  if (opts.fixtures.includes('typical')) {
    for (const size of sizes)
      if (size.name !== 'maximized-1920x1080')
        await render(size, 'typical', 'selected');
    await render(defaultSize, 'typical', 'settings');
  }

  // G3 lifecycle and the G4 reload check: resize, settings, maximize, minimize, reload.
  let beforeReload = '';
  let afterReload = '';
  for (const fixture of opts.fixtures.filter((f) => f !== 'empty')) {
    await errors.check(page);
    const query = {
      type,
      fixture,
      w: defaultSize.width,
      h: defaultSize.height,
      selected: true,
    };
    await openHarness(page, query);
    const before = await faceText(page, type);
    const card = page.locator(windowSelector(type));
    const handle = card.locator('.resize-handle.cursor-se-resize');
    if ((await handle.count()) > 0) {
      for (const [dx, dy] of [
        [240, 160],
        [-240, -160],
      ]) {
        const b = (await handle.boundingBox())!;
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
          steps: 8,
        });
        await page.mouse.up();
        await page.waitForTimeout(SETTLE_MS);
      }
    }
    for (const key of ['Alt+s', 'Alt+s', 'Alt+m', 'Alt+m', 'Escape']) {
      await page.locator(windowSelector(type)).focus();
      await page.keyboard.press(key);
      await page.waitForTimeout(SETTLE_MS);
    }
    await page.reload();
    await page.waitForSelector('[data-grader-ready="true"]', {
      timeout: READY_TIMEOUT_MS,
    });
    const after = await faceText(page, type);
    if (fixture === 'typical') {
      beforeReload = before;
      afterReload = after;
    }
    records.push({
      size: defaultSize,
      fixture,
      variant: 'lifecycle',
      g3: await errors.check(page),
    });
  }

  let g4 = null;
  if (opts.fixtures.includes('typical') && opts.fixtures.includes('empty')) {
    await openHarness(page, {
      type,
      fixture: 'typical',
      w: defaultSize.width,
      h: defaultSize.height,
      count: 2,
    });
    const second = await faceText(page, type, 2);
    records.push({
      size: defaultSize,
      fixture: 'typical',
      variant: 'lifecycle',
      g3: await errors.check(page),
    });
    g4 = analyzeG4({
      beforeReload,
      afterReload,
      emptyText: texts.empty ?? '',
      typicalText: texts.typical ?? '',
      secondText: second,
    });
  }
  return summarize(type, records, g4, opts.thresholds);
}
