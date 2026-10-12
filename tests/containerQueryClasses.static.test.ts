import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Tailwind 3 here has no container-queries plugin, so `@container` and `@[Npx]:` classes compile to nothing.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['components', 'context', 'hooks', 'App.tsx'];
// `[@container(...)]:` arbitrary variants and raw CSS `@container (...)` rules are fine.
const DEAD_CLASS =
  /(?<![[\w])@(?:\[[^\]\s]+\]:|container(?=[\s"'`/]))(?!\s*\()/;

const listFiles = (path: string): string[] => {
  const abs = join(repoRoot, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).flatMap((name) => {
    const child = join(path, name);
    if (statSync(join(repoRoot, child)).isDirectory()) return listFiles(child);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [child] : [];
  });
};

describe('container query classes', () => {
  it('uses [@container(...)]: variants instead of plugin-only classes', () => {
    const offenders: string[] = [];
    for (const file of SCAN_ROOTS.flatMap(listFiles)) {
      readFileSync(join(repoRoot, file), 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          if (DEAD_CLASS.test(line)) {
            offenders.push(
              `${relative(repoRoot, join(repoRoot, file)).replace(/\\/g, '/')}:${i + 1}`
            );
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('matches the dead forms and skips the working ones', () => {
    expect(DEAD_CLASS.test('className="hidden @[280px]:inline"')).toBe(true);
    expect(DEAD_CLASS.test("'@container group relative'")).toBe(true);
    expect(
      DEAD_CLASS.test('className="[@container(min-width:600px)]:inline"')
    ).toBe(false);
    expect(DEAD_CLASS.test('  @container (aspect-ratio >= 1.5) {')).toBe(false);
  });
});
