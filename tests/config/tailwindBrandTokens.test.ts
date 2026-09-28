import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config.js';

const ROOT = join(__dirname, '../..');
const SOURCE_DIRS = ['components', 'context', 'hooks', 'utils', 'config'];
const BARE_BRAND =
  /(?:^|[\s'"`:])(?:[a-z-]+)-brand-(red|blue|gray)(?:\/\d+)?(?=[\s'"`]|$)/gm;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
}

describe('tailwind brand colour tokens', () => {
  it('defines a DEFAULT shade for every brand family used without a shade', () => {
    const files: string[] = [];
    for (const dir of SOURCE_DIRS) walk(join(ROOT, dir), files);
    const used = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(BARE_BRAND)) {
        used.add(m[1]);
      }
    }
    const colors = config.theme?.extend?.colors as
      | { brand?: Record<string, Record<string, string>> }
      | undefined;
    const brand = colors?.brand ?? {};
    const missing = [...used].filter((family) => !brand[family]?.DEFAULT);
    expect(used.has('red')).toBe(true);
    expect(missing).toEqual([]);
  });
});
