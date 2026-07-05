// DE locale used the English loanword "Board" in 12 keys instead of the project's established "Tafel"; also guards against future re-introduction.

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';

type LocaleFile = typeof en;

/** Dotted path walker — returns the leaf string or undefined. */
function getLeaf(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Recursively collects [path, value] pairs for every string leaf. */
function collectStrings(
  obj: unknown,
  path: string,
  out: Array<[string, string]>
): void {
  if (obj == null || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${key}` : key;
    if (typeof value === 'string') {
      out.push([p, value]);
    } else if (value && typeof value === 'object') {
      collectStrings(value, p, out);
    }
  }
}

const AFFECTED_KEYS: Array<{ path: string; expectedDe: string }> = [
  {
    path: 'widgets.cheatSheet.boardGestures',
    expectedDe: 'Tafel-Hintergrund',
  },
  {
    path: 'widgets.stickers.clearAll',
    expectedDe: 'Alle Sticker von der Tafel löschen',
  },
  {
    path: 'widgets.stickers.dragFromLibrary',
    expectedDe: 'Sticker aus der Bibliothek auf die Tafel ziehen',
  },
  {
    path: 'widgets.stickers.stickerAdded',
    expectedDe: 'Sticker zur Tafel hinzugefügt!',
  },
  { path: 'widgets.clock.fonts.inherit', expectedDe: 'Von der Tafel' },
  {
    path: 'shareCollection.subtitle',
    expectedDe: '{{count}} Tafel(n) aus dieser Sammlung werden geteilt.',
  },
  { path: 'subCollections.openBoard', expectedDe: 'Diese Tafel öffnen' },
  {
    path: 'style.readOnlyNotice',
    expectedDe:
      'Diese Tafel ist schreibgeschützt. Stiländerungen werden nicht gespeichert.',
  },
  {
    path: 'admin.stickers.clearAll',
    expectedDe: 'Alle Sticker von der Tafel löschen',
  },
  {
    path: 'admin.stickers.dragFromLibrary',
    expectedDe: 'Sticker aus der Bibliothek auf die Tafel ziehen',
  },
  {
    path: 'admin.stickers.stickerAdded',
    expectedDe: 'Sticker zur Tafel hinzugefügt!',
  },
  { path: 'plcRoute.backToBoard', expectedDe: 'Zurück zu meiner Tafel' },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('DE locale — "Board" terminology replaced with "Tafel"', () => {
  it.each(AFFECTED_KEYS)(
    'de.$path is the Tafel-based translation, not the Board drift',
    ({ path, expectedDe }) => {
      const value = getLeaf(de as unknown as LocaleFile, path);
      expect(value, `de.${path} is missing`).toBeDefined();
      expect(
        value,
        `de.${path} should be "${expectedDe}" (project convention is "Tafel", not the English ` +
          `loanword "Board") but got "${value}"`
      ).toBe(expectedDe);
    }
  );

  it('has no remaining standalone "Board"/"Boards" usages anywhere in the locale', () => {
    const all: Array<[string, string]> = [];
    collectStrings(de, '', all);
    const offenders = all.filter(([, value]) => /\bBoards?\b/.test(value));
    expect(
      offenders,
      `Found ${offenders.length} DE locale value(s) using the English loanword "Board" ` +
        `instead of the established "Tafel" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });
});
