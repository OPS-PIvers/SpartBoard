/**
 * Regression test for the missing widgets.stickers sub-namespace in DE and FR.
 *
 * The `widgets.stickers` namespace was added to EN when the Sticker Book widget
 * received its i18n pass.  The companion `admin.stickers` namespace (used by
 * StickerLibraryModal) was correctly propagated to all locales in #1788, but
 * the `widgets.stickers` path — which is what StickerBookWidget.tsx resolves —
 * was never added to DE or FR.
 *
 * Affected call sites in `components/widgets/stickers/StickerBookWidget.tsx`
 * and `components/admin/StickerLibraryModal.tsx` that use the widgets.stickers
 * path WITHOUT a `defaultValue` fallback:
 *
 *   t('widgets.stickers.dragOrClick')      — line 94
 *   t('widgets.stickers.deleteSticker')    — lines 155, 156
 *   t('widgets.stickers.stickerAdded')     — line 396
 *   t('widgets.stickers.collectionTitle')  — line 482
 *   t('widgets.stickers.clearAll')         — line 493
 *   t('widgets.stickers.wait')             — line 527
 *   t('widgets.stickers.dropOrPaste')      — lines 627, 292 (StickerLibraryModal)
 *   t('widgets.stickers.toAddCustom')      — line 633
 *   t('widgets.stickers.dragFromLibrary')  — line 696
 *
 * When a German or French user opens the Sticker Book widget, every one of
 * these strings renders as the raw key path (e.g. "widgets.stickers.clearAll")
 * instead of a translated or even English string.
 *
 * This test loads each locale JSON directly so the assertion fires even before
 * the i18next runtime would attempt (and silently skip) the fallback.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/**
 * Keys within widgets.stickers that StickerBookWidget.tsx calls t() on without
 * a defaultValue fallback — these show raw key paths to non-EN users if absent.
 */
const REQUIRED_WIDGET_STICKERS_KEYS = [
  'collectionTitle',
  'clearAll',
  'wait',
  'dropOrPaste',
  'toAddCustom',
  'essentials',
  'globalCollection',
  'myCollection',
  'dragOrClick',
  'deleteSticker',
  'dragFromLibrary',
  'stickerAdded',
] as const;

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.stickers baseline', () => {
  it('has a widgets.stickers section', () => {
    expect(en).toHaveProperty(['widgets', 'stickers']);
  });

  it('has all required widgets.stickers keys', () => {
    for (const key of REQUIRED_WIDGET_STICKERS_KEYS) {
      expect(
        en.widgets.stickers,
        `en.widgets.stickers.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ─────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — widgets.stickers parity with EN', ({ code, locale }) => {
  it(`${code}: has a widgets.stickers section`, () => {
    expect(
      locale,
      `${code}.widgets.stickers section is entirely missing`
    ).toHaveProperty(['widgets', 'stickers']);
  });

  it(`${code}: has all required widgets.stickers keys`, () => {
    for (const key of REQUIRED_WIDGET_STICKERS_KEYS) {
      expect(
        locale,
        `${code}.widgets.stickers.${key} is missing`
      ).toHaveProperty(['widgets', 'stickers', key]);
    }
  });
});
