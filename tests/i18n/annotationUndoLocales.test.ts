/**
 * The annotation clear-all confirm, the "switch back to that board" undo toast,
 * and the board undo/redo entries in the Help center's Shortcuts tab were all
 * hardcoded English. They now go through t(), so every locale needs the keys —
 * a missing one renders the English string for a German/Spanish/French teacher.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const LOCALES = [
  { code: 'en', locale: en as unknown as Record<string, unknown> },
  { code: 'de', locale: de as unknown as Record<string, unknown> },
  { code: 'es', locale: es as unknown as Record<string, unknown> },
  { code: 'fr', locale: fr as unknown as Record<string, unknown> },
];

const ANNOTATION_KEYS = [
  'clearConfirmBody',
  'clearConfirmTitle',
  'clearConfirmAction',
  'chromeInertHint',
] as const;

const at = (root: Record<string, unknown>, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      root
    );

describe.each(LOCALES)(
  '$code locale — annotation and undo strings',
  ({ code, locale }) => {
    it(`${code}: has every annotation key`, () => {
      for (const key of ANNOTATION_KEYS) {
        const value = at(locale, `annotation.${key}`);
        expect(typeof value, `${code}.annotation.${key} is missing`).toBe(
          'string'
        );
      }
    });

    it(`${code}: has toasts.switchBoardToUndo`, () => {
      expect(typeof at(locale, 'toasts.switchBoardToUndo')).toBe('string');
    });

    it(`${code}: has the undo/redo shortcut labels`, () => {
      expect(typeof at(locale, 'helpCenter.shortcuts.undo')).toBe('string');
      expect(typeof at(locale, 'helpCenter.shortcuts.redo')).toBe('string');
    });
  }
);

describe('non-EN annotation strings are actually translated', () => {
  it.each([
    { code: 'de', locale: de as unknown as Record<string, unknown> },
    { code: 'es', locale: es as unknown as Record<string, unknown> },
    { code: 'fr', locale: fr as unknown as Record<string, unknown> },
  ])('$code: does not copy the EN clear-all confirm', ({ locale }) => {
    expect(at(locale, 'annotation.clearConfirmBody')).not.toBe(
      at(
        en as unknown as Record<string, unknown>,
        'annotation.clearConfirmBody'
      )
    );
  });
});
