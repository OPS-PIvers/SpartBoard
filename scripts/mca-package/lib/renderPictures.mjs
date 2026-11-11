// Render stage: stimulus tabs and vector figures become PNGs in Microsoft Edge (needs Edge installed).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIME = { svg: 'image/svg+xml', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

const dataUri = (dir, index, id) => {
  const info = index[id];
  if (!info) throw new Error(`Picture ${id} is not in the cache`);
  const bytes = readFileSync(join(dir, 'img', `${id}.${info.ext}`));
  return `data:${MIME[info.ext] ?? 'application/octet-stream'};base64,${bytes.toString('base64')}`;
};

export const inlinePictures = (html, dir, index) =>
  html
    .replace(
      /src="\/api\/QuestionDetails\/itemresource\?TableID=([0-9a-f-]+)"/gi,
      (_, id) => `src="${dataUri(dir, index, id)}"`
    )
    .replace(/\s(height|width)="\d+"/g, '');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const sheetPage = (title, body) => `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff;font:19px/1.55 Georgia,'Times New Roman',serif;color:#111}
  #sheet{width:860px;padding:28px 36px 32px;box-sizing:border-box}
  h1{font:700 22px/1.3 Arial,Helvetica,sans-serif;margin:0 0 14px;padding-bottom:10px;border-bottom:3px solid #2d3f89;color:#2d3f89}
  .paragraph{margin:0 0 14px} img{max-width:100%;height:auto;display:block;margin:6px auto}
  table{border-collapse:collapse;margin:8px auto} td,th{border:1px solid #555;padding:6px 10px;font-size:17px}
  .src{font:12px Arial,sans-serif;color:#666;margin-top:14px}
</style><div id="sheet">${title ? `<h1>${esc(title)}</h1>` : ''}${body}${title ? '<div class="src">Source: Minnesota Department of Education, Minnesota Questions Tool (released MCA items)</div>' : ''}</div>`;

/**
 * @param {{ dir: string, imageIndex: object, pictures: { tabs: object[], figures: object[], charts: object[] } }} input
 * @returns {Promise<Map<string, Buffer>>} keyed by the path stimuli use (`pictures/x.png`)
 */
export async function renderPictures({ dir, imageIndex, pictures, log = console.log }) {
  const { chromium } = await import('@playwright/test');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge' });
  } catch (err) {
    throw new Error(
      `Could not start Microsoft Edge (the picture step needs it installed): ${err.message}`
    );
  }
  const out = new Map();
  try {
    const ctx = await browser.newContext({
      deviceScaleFactor: 1.5,
      viewport: { width: 900, height: 800 },
    });
    const page = await ctx.newPage();
    const shoot = async (html) => {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() =>
        Promise.all([...document.images].map((i) => i.decode().catch(() => null)))
      );
      return page.locator('#sheet').screenshot({ type: 'png' });
    };
    for (const tab of pictures.tabs) {
      out.set(
        `pictures/${tab.file}`,
        await shoot(sheetPage(tab.title, inlinePictures(tab.html, dir, imageIndex)))
      );
    }
    log(`${pictures.tabs.length} stimulus tabs rendered`);
    for (const fig of pictures.figures) {
      const path = `pictures/${fig.file}`;
      if (fig.ext === 'png' || fig.ext === 'jpg') {
        out.set(path, readFileSync(join(dir, 'img', `${fig.imgId}.${fig.ext}`)));
      } else {
        out.set(path, await shoot(sheetPage('', `<img src="${dataUri(dir, imageIndex, fig.imgId)}">`)));
      }
    }
    log(`${pictures.figures.length} item figures ready`);
  } finally {
    await browser.close();
  }
  for (const c of pictures.charts) {
    out.set(`pictures/${c.file}`, readFileSync(join(dir, 'charts', `${c.itemTableId}.png`)));
  }
  return out;
}
