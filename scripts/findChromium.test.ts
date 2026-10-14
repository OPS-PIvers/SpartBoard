import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { browserCaches, installedChromiums } from './lib/findChromium.mjs';

let root: string;
const exe = (...parts: string[]) => {
  const path = join(root, ...parts);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '');
  return path;
};

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('installedChromiums', () => {
  it('lists the newest build first, headless shell before the full build', () => {
    root = mkdtempSync(join(tmpdir(), 'chromium-'));
    const oldFull = exe('chromium-1100', 'chrome-linux', 'chrome');
    const shell = exe(
      'chromium_headless_shell-1194',
      'chrome-headless-shell-linux64',
      'chrome-headless-shell'
    );
    const full = exe('chromium-1194', 'chrome-linux64', 'chrome');
    exe('ffmpeg-1011', 'ffmpeg');
    expect(installedChromiums([root]).slice(0, 3)).toEqual([
      shell,
      full,
      oldFull,
    ]);
  });

  it('skips build folders with no executable and missing caches', () => {
    root = mkdtempSync(join(tmpdir(), 'chromium-'));
    mkdirSync(join(root, 'chromium-1300', 'chrome-linux'), { recursive: true });
    const found = installedChromiums([root, join(root, 'nope')]);
    expect(found.some((p) => p.startsWith(root))).toBe(false);
  });
});

describe('browserCaches', () => {
  it('puts PLAYWRIGHT_BROWSERS_PATH first', () => {
    root = mkdtempSync(join(tmpdir(), 'chromium-'));
    expect(
      browserCaches(
        { PLAYWRIGHT_BROWSERS_PATH: '/pw', XDG_CACHE_HOME: '/c' },
        'linux'
      )
    ).toEqual(['/pw', join('/c', 'ms-playwright')]);
  });
});
