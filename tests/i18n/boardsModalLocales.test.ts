/**
 * Regression test for the boardsModal colorPicker locale bug.
 *
 * The CollectionColorPicker component uses boardsModal.colorPicker.* keys.
 * A prior refactor replaced the old inline-prompt approach (colorPrompt /
 * colorInvalid) with a proper color-picker UI (colorPicker.*), but only
 * updated the EN locale. DE, ES, and FR still carried the stale keys and
 * were missing the replacement keys that the component actually calls
 * t('boardsModal.colorPicker.*') on.
 *
 * Additionally, boardsModal.select, boardsModal.deselect,
 * boardsModal.colorSaveFailed, boardsModal.collectionMoved, and
 * boardsModal.collectionMoveFailed were added to EN as part of the same
 * feature work but never propagated to the non-English locales.
 *
 * This test loads each locale JSON directly (not via i18next) so it will
 * catch key-presence issues even before the i18next runtime resolves them.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** All boardsModal keys the current codebase references via t(). */
const REQUIRED_BOARDS_MODAL_KEYS = [
  'select',
  'deselect',
  'colorSaveFailed',
  'collectionMoved',
  'collectionMoveFailed',
  'colorPicker',
] as const;

/** The old inline-prompt keys that were replaced by colorPicker.*  */
const OBSOLETE_BOARDS_MODAL_KEYS = ['colorPrompt', 'colorInvalid'] as const;

/** The nested keys that must exist under boardsModal.colorPicker. */
const REQUIRED_COLOR_PICKER_KEYS = [
  'title',
  'swatches',
  'custom',
  'applyCustom',
] as const;

type LocaleFile = typeof en;

// Verify EN itself is the reference baseline
describe('EN locale — boardsModal baseline', () => {
  it('has all required boardsModal keys', () => {
    for (const key of REQUIRED_BOARDS_MODAL_KEYS) {
      expect(en.boardsModal).toHaveProperty(key);
    }
  });

  it('has all required colorPicker sub-keys', () => {
    expect(en.boardsModal).toHaveProperty('colorPicker');
    for (const key of REQUIRED_COLOR_PICKER_KEYS) {
      expect(
        (en.boardsModal as Record<string, unknown>).colorPicker
      ).toHaveProperty(key);
    }
  });

  it('does not contain obsolete colorPrompt / colorInvalid keys', () => {
    for (const key of OBSOLETE_BOARDS_MODAL_KEYS) {
      expect(en.boardsModal).not.toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])('$code locale — boardsModal parity with EN', ({ code, locale }) => {
  it(`${code}: has all required boardsModal keys`, () => {
    for (const key of REQUIRED_BOARDS_MODAL_KEYS) {
      expect(
        locale.boardsModal,
        `${code}.boardsModal.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required colorPicker sub-keys`, () => {
    expect(locale.boardsModal).toHaveProperty('colorPicker');
    for (const key of REQUIRED_COLOR_PICKER_KEYS) {
      expect(
        (locale.boardsModal as Record<string, unknown>).colorPicker,
        `${code}.boardsModal.colorPicker.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: does not carry obsolete colorPrompt / colorInvalid keys`, () => {
    for (const key of OBSOLETE_BOARDS_MODAL_KEYS) {
      expect(
        locale.boardsModal,
        `${code}.boardsModal.${key} is an obsolete key that should have been removed`
      ).not.toHaveProperty(key);
    }
  });
});
