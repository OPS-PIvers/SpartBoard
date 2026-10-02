#!/usr/bin/env node
// Draws each step's pin, region, spotlight and callout box over its slide: node contact_sheet.mjs <file.gl.json> [outDir] [--help-size]
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const helpSize = args.includes('--help-size');
const [file, outDir = '.playwright-mcp/sheets'] = args.filter(
  (a) => !a.startsWith('--')
);
if (!file) {
  console.error(
    'Usage: node contact_sheet.mjs <file.gl.json> [outDir] [--help-size]'
  );
  process.exit(1);
}
const set = JSON.parse(readFileSync(file, 'utf8'));
mkdirSync(outDir, { recursive: true });

// The Help Center player is a 16:9 box about 900px wide; --help-size draws slides at that size.
const HELP_BOX = { w: 900, h: 506 };
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

function overlay(step, n, w, h) {
  const x = (step.xPct / 100) * w;
  const y = (step.yPct / 100) * h;
  const parts = [];
  const r = step.region;
  if (r) {
    const rw = (r.wPct / 100) * w;
    const rh = (r.hPct / 100) * h;
    if (r.shape === 'ellipse') {
      parts.push(
        `<ellipse cx="${x}" cy="${y}" rx="${rw / 2}" ry="${rh / 2}" class="region"/>`
      );
    } else if (r.shape === 'polygon') {
      const pts = r.points
        .map((p) => `${(p.x / 100) * w},${(p.y / 100) * h}`)
        .join(' ');
      parts.push(`<polygon points="${pts}" class="region"/>`);
    } else {
      const rx = ((r.cornerPct ?? 0) / 100) * Math.min(rw, rh);
      parts.push(
        `<rect x="${x - rw / 2}" y="${y - rh / 2}" width="${rw}" height="${rh}" rx="${rx}" class="region"/>`
      );
    }
  } else if (
    ['spotlight', 'pan-zoom-spotlight'].includes(step.interactionType)
  ) {
    const radius = ((step.spotlightRadius ?? 25) / 100) * Math.min(w, h);
    parts.push(`<circle cx="${x}" cy="${y}" r="${radius}" class="spot"/>`);
  }
  const b = step.calloutBox;
  if (b) {
    parts.push(
      `<rect x="${(b.xPct / 100) * w}" y="${(b.yPct / 100) * h}" width="${(b.wPct / 100) * w}" height="${(b.hPct / 100) * h}" class="box"/>`
    );
  }
  parts.push(
    `<circle cx="${x}" cy="${y}" r="11" class="pin"/><text x="${x}" y="${y + 4}" class="num">${n}</text>`
  );
  return parts.join('');
}

const executablePath = existsSync('/opt/pw-browsers/chromium')
  ? '/opt/pw-browsers/chromium'
  : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

for (const [index, url] of set.imageUrls.entries()) {
  if (set.imageKinds?.[index] === 'video') continue;
  const steps = set.steps
    .map((s, i) => ({ s, n: i + 1 }))
    .filter(({ s }) => s.imageIndex === index);
  await page.setContent(`<img id="i" src="${url}">`);
  const natural = await page.$eval('#i', (img) => ({
    w: img.naturalWidth,
    h: img.naturalHeight,
  }));
  const scale = helpSize
    ? Math.min(HELP_BOX.w / natural.w, HELP_BOX.h / natural.h)
    : 1;
  const w = Math.round(natural.w * scale);
  const h = Math.round(natural.h * scale);
  const list = steps
    .map(({ s, n }) => {
      const zoom =
        s.panZoomScale || s.interactionType.startsWith('pan-zoom')
          ? ` · zoom ${s.panZoomScale ?? 2.5}`
          : '';
      const bind = s.tour
        ? ` · ${s.tour.action} ${s.tour.anchor || `(${s.tour.fallback?.name})`}`
        : '';
      return `<li><b>${n}. ${esc(s.label) || '—'}</b> <i>${s.interactionType}${zoom}${bind}</i><br>${esc(s.text ?? s.question?.text)}</li>`;
    })
    .join('');
  await page.setViewportSize({
    width: Math.max(w, 600),
    height: h + 40 + steps.length * 48,
  });
  await page.setContent(`<!doctype html><style>
    body{margin:0;font:13px system-ui;background:#fff}
    .stage{position:relative;width:${w}px;height:${h}px;background:#333}
    .stage img{width:${w}px;height:${h}px;display:block}
    svg{position:absolute;inset:0}
    .region{fill:none;stroke:#e11d48;stroke-width:2}
    .spot{fill:none;stroke:#eab308;stroke-width:2;stroke-dasharray:6 4}
    .box{fill:rgba(37,99,235,.12);stroke:#2563eb;stroke-width:2}
    .pin{fill:#c026d3}.num{fill:#fff;font:bold 12px system-ui;text-anchor:middle}
    ol{list-style:none;margin:8px;padding:0}li{margin:0 0 6px}
  </style><div class="stage"><img src="${url}"><svg width="${w}" height="${h}">${steps
    .map(({ s, n }) => overlay(s, n, w, h))
    .join('')}</svg></div><ol>${list}</ol>`);
  const out = join(
    outDir,
    `slide-${String(index + 1).padStart(2, '0')}${helpSize ? '-help' : ''}.png`
  );
  await page.screenshot({ path: out, fullPage: true });
  console.log(`${out}  ${natural.w}x${natural.h}  ${steps.length} steps`);
}
await browser.close();
