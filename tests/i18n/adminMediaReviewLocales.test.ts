/**
 * Regression test: the entire `admin.mediaReview` namespace (Org > Media
 * Review panel, `components/admin/Organization/views/MediaReviewView.tsx`)
 * was added to EN, DE, ES, and FR in the same commit (9010d4d), but the
 * DE/ES/FR copies are byte-identical to the EN strings — the feature was
 * never actually translated, just copy-pasted. Non-English admins deleting
 * student media (a destructive, confirm-by-typing-a-word flow) see raw
 * English throughout.
 *
 * Presence-only checks (`toHaveProperty`) can't catch this because every key
 * *is* present — just untranslated. So this test asserts DE/ES/FR values
 * actually differ from EN wherever a human translation is expected to
 * differ, rather than merely asserting the keys exist.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type MediaReview = typeof en.admin.mediaReview;

/** Keys whose EN value is expected to differ by locale (real prose/labels, not language-neutral). */
const TRANSLATABLE_KEYS: (keyof Omit<MediaReview, 'status'>)[] = [
  'title',
  'blurb',
  'refresh',
  'filterTeacher',
  'allTeachers',
  'filterAfter',
  'filterBefore',
  'clearFilters',
  'loading',
  'errorTitle',
  'retry',
  'emptyTitle',
  'emptyMessage',
  'truncated',
  'rowCount',
  'rowCount_other',
  'takeCount',
  'takeCount_other',
  'colStudent',
  'colQuestion',
  'colTeacher',
  'colTakes',
  'colStatus',
  'colArchived',
  'selectAll',
  'selectRow',
  'deleteSelected',
  'deleting',
  'deletingProgress',
  'dismiss',
  'requestFailed',
  'resultsTitle',
  'confirmTitle',
  'confirmSummary',
  'confirmWarning',
  'confirmWord',
  'typeToConfirm',
  'confirmDelete',
  'cancel',
];

// Legitimate cognates: the real word in that language is spelled the same as EN.
const SAME_AS_EN_EXCEPTIONS: Record<string, readonly string[]> = {
  de: ['colStatus'], // "Status" is the German word too
  fr: ['colQuestion'], // "Question" is the French word too
  es: [],
};

const TRANSLATABLE_STATUS_KEYS: (keyof MediaReview['status'])[] = [
  'syncing',
  'archived',
  'failed',
  'lost',
  'deleting',
  'deleted',
  'delete-failed',
];

describe('EN locale — admin.mediaReview baseline', () => {
  it('has an admin.mediaReview section with every required key', () => {
    expect(en).toHaveProperty(['admin', 'mediaReview']);
    for (const key of TRANSLATABLE_KEYS) {
      expect(
        en.admin.mediaReview,
        `en.admin.mediaReview.${key} is missing`
      ).toHaveProperty(key);
    }
    for (const key of TRANSLATABLE_STATUS_KEYS) {
      expect(
        en.admin.mediaReview.status,
        `en.admin.mediaReview.status.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])(
  '$code locale — admin.mediaReview is actually translated, not copy-pasted EN',
  ({ code, locale }) => {
    it(`${code}: every admin.mediaReview string differs from the EN string`, () => {
      const mr = locale.admin.mediaReview as Record<string, unknown>;
      const exceptions = SAME_AS_EN_EXCEPTIONS[code] ?? [];
      for (const key of TRANSLATABLE_KEYS) {
        if (exceptions.includes(key)) continue;
        const enValue = en.admin.mediaReview[key];
        expect(
          mr[key],
          `${code}.admin.mediaReview.${key} is untranslated (still equals the EN string "${enValue}")`
        ).not.toBe(enValue);
      }
    });

    it(`${code}: every admin.mediaReview.status string differs from the EN string`, () => {
      const status = (locale.admin.mediaReview as MediaReview).status as Record<
        string,
        unknown
      >;
      for (const key of TRANSLATABLE_STATUS_KEYS) {
        const enValue = en.admin.mediaReview.status[key];
        expect(
          status[key],
          `${code}.admin.mediaReview.status.${key} is untranslated (still equals the EN string "${enValue}")`
        ).not.toBe(enValue);
      }
    });
  }
);
