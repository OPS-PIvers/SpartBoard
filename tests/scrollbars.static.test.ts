import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// The app has one scrollbar style (index.css) and vertical scrollers never grow a sideways bar.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(repoRoot, 'index.css'), 'utf8');

const listFiles = (dir: string): string[] =>
  readdirSync(join(repoRoot, dir)).flatMap((name) => {
    const child = join(dir, name);
    if (statSync(join(repoRoot, child)).isDirectory()) return listFiles(child);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [child]
      : [];
  });

describe('scrollbars', () => {
  it('clips sideways overflow on every vertical scroller', () => {
    const base = css.slice(css.indexOf('@layer base {'));
    expect(base).toMatch(
      /\.overflow-y-auto,\s*\.overflow-y-scroll\s*\{\s*overflow-x:\s*hidden;/
    );
  });

  it('sizes both scrollbar directions', () => {
    const rule = /::-webkit-scrollbar\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/width:/);
    expect(rule).toMatch(/height:/);
  });

  it('keeps scrollbar styling in index.css only', () => {
    const offenders = ['components', 'context', 'hooks', 'utils']
      .flatMap(listFiles)
      .filter((file) =>
        /::-webkit-scrollbar|scrollbar-(width|color)/.test(
          readFileSync(join(repoRoot, file), 'utf8')
        )
      );
    expect(
      offenders,
      'Style scrollbars in index.css, or hide one with no-scrollbar.'
    ).toEqual([]);
  });
});
