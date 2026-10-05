// Gate detectors on synthetic DOM in a real browser, plus a planted failure through the harness.

import { expect, test, type Page } from '@playwright/test';
import { analyzeG1, analyzeG2, analyzeG3 } from './analyze';
import { ErrorLog, openHarness, snapshot } from './measureWidget';

const card = (body: string): string => `
  <style>
    body { margin: 0; font: 16px sans-serif; }
    .card { position: absolute; left: 100px; top: 100px; width: 300px; height: 200px; overflow: hidden; background: #fff; }
    .fill { position: relative; width: 100%; height: 100%; }
    button { width: 60px; height: 44px; }
  </style>
  <div class="card" data-draggable-window data-widget-id="grader-synthetic-1">
    <div class="fill">${body}</div>
  </div>`;

const snap = async (page: Page, body: string) => {
  await page.setContent(card(body));
  return snapshot(page, 'synthetic');
};

test.describe('G1 unreachable control', () => {
  test('passes for a button inside the card', async ({ page }) => {
    const s = await snap(
      page,
      '<button style="position:absolute;left:20px;top:20px">Go</button>'
    );
    expect(analyzeG1(s).pass).toBe(true);
  });
  test('fails for a button cut off by the card edge', async ({ page }) => {
    const s = await snap(
      page,
      '<button style="position:absolute;right:-40px;top:20px">Go</button>'
    );
    expect(analyzeG1(s).values.clipped).toBe(1);
  });
  test('fails for a button covered by another element', async ({ page }) => {
    const s = await snap(
      page,
      '<button style="position:absolute;left:20px;top:20px">Go</button><div style="position:absolute;left:0;top:0;width:150px;height:100px;background:red"></div>'
    );
    const g1 = analyzeG1(s);
    expect(g1.pass).toBe(false);
    expect(g1.values.covered).toBe(1);
  });
  test('passes for a button scrolled out of view inside a scroller', async ({
    page,
  }) => {
    const s = await snap(
      page,
      '<div style="height:100%;overflow-y:auto"><div style="height:600px"></div><button>Go</button></div>'
    );
    expect(analyzeG1(s).pass).toBe(true);
  });
});

test.describe('G2 clipped content', () => {
  test('passes for wrapped text', async ({ page }) => {
    const s = await snap(
      page,
      '<p style="margin:8px">A short line of text that wraps</p>'
    );
    expect(analyzeG2(s).pass).toBe(true);
  });
  test('fails for a long word cut by a non-scrolling box', async ({ page }) => {
    const s = await snap(
      page,
      '<div style="width:120px;overflow:hidden"><span style="white-space:nowrap">Supercalifragilisticexpialidocious</span></div>'
    );
    expect(analyzeG2(s).pass).toBe(false);
  });
  test('passes for the same word truncated with an ellipsis', async ({
    page,
  }) => {
    const s = await snap(
      page,
      '<div style="width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Supercalifragilisticexpialidocious</div>'
    );
    const g2 = analyzeG2(s);
    expect(g2.pass).toBe(true);
    expect(g2.values.truncatedText).toBe(1);
  });
  test('passes for overflow inside a scroller', async ({ page }) => {
    const s = await snap(
      page,
      `<div style="height:100%;overflow-y:auto">${'<p>Row of text</p>'.repeat(30)}</div>`
    );
    expect(analyzeG2(s).pass).toBe(true);
  });
});

test.describe('G3 runtime errors', () => {
  test('passes with a quiet console and fails on console.error', async ({
    page,
  }) => {
    const log = new ErrorLog(page);
    await page.setContent(card('<p>Hi</p>'));
    expect(analyzeG3(await log.drain(page)).pass).toBe(true);
    await page.evaluate(() => console.error('boom'));
    expect(analyzeG3(await log.drain(page)).pass).toBe(false);
  });
});

test.describe('planted failure through the harness', () => {
  const query = { type: 'clock', fixture: 'typical' as const, w: 300, h: 200 };

  test('a real widget passes G1 untouched', async ({ page }) => {
    await openHarness(page, query);
    expect(analyzeG1(await snapshot(page, 'clock')).pass).toBe(true);
  });

  test('a button planted half outside the card trips G1', async ({ page }) => {
    await openHarness(page, query);
    await page.evaluate(() => {
      const content = document.querySelector(
        '[data-testid="drag-surface"] > .flex-1'
      );
      const button = document.createElement('button');
      button.textContent = 'Planted';
      button.setAttribute(
        'style',
        'position:absolute;right:-40px;top:40px;width:90px;height:44px'
      );
      content?.appendChild(button);
    });
    const g1 = analyzeG1(await snapshot(page, 'clock'));
    expect(g1.pass).toBe(false);
    expect(String(g1.values.offenders)).toContain('Planted');
  });
});
