import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when OCR or background removal could fetch runtime code from a public CDN, or Hosting stops restricting script and worker sources.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_ROOTS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'functions',
  'remotion',
  'tests',
  'public',
  'docs',
  'scripts',
  'extension',
]);

const listFiles = (dir: string): string[] =>
  readdirSync(join(repoRoot, dir)).flatMap((name) => {
    const child = dir ? join(dir, name) : name;
    if (name.startsWith('.')) return [];
    if (statSync(join(repoRoot, child)).isDirectory())
      return !dir && SKIP_ROOTS.has(name) ? [] : listFiles(child);
    return /\.[jt]sx?$/.test(name) && !/\.(test|spec)\.[jt]sx?$/.test(name)
      ? [child]
      : [];
  });

const sources = listFiles('').map((f) => ({
  file: f,
  text: readFileSync(join(repoRoot, f), 'utf-8'),
}));

describe('self-hosted OCR and background removal', () => {
  it('passes the self-hosted paths to every tesseract call', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { file, text } of sources) {
      for (const m of text.matchAll(
        /(?:Tesseract\.recognize|\bcreateWorker)\(/g
      )) {
        if (!text.includes('tesseract.js')) continue;
        seen += 1;
        const call = text.slice(m.index, m.index + 160);
        if (!call.includes('TESSERACT_PATHS')) bad.push(`${file}: ${call}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('gives the background-removal library a publicPath', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { file, text } of sources) {
      for (const m of text.matchAll(
        /imglyRemoveBackground\(([\s\S]*?)\n\s*\}\);/g
      )) {
        seen += 1;
        if (!m[1].includes('publicPath')) bad.push(file);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('serves a script and worker policy from Hosting that names no CDN for these libraries', () => {
    const config = JSON.parse(
      readFileSync(join(repoRoot, 'firebase.json'), 'utf-8')
    ) as {
      hosting: {
        headers: {
          source: string;
          headers: { key: string; value: string }[];
        }[];
      };
    };
    const all = config.hosting.headers.find((h) => h.source === '**');
    const csp = all?.headers.find((h) => h.key === 'Content-Security-Policy');
    expect(csp?.value).toMatch(/script-src [^;]*'self'/);
    expect(csp?.value).toMatch(/worker-src [^;]*'self'/);
    expect(csp?.value).not.toMatch(/jsdelivr|staticimgly|unpkg/);
  });
});
