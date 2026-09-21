/** The document-import rollout switch must fail closed on anything malformed. */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS,
  normalizeQuizDocumentImportSettings,
} from '@/config/quizDocumentImport';

describe('normalizeQuizDocumentImportSettings', () => {
  it('ships off', () => {
    expect(DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS.enabled).toBe(false);
  });

  it('reads an explicit true', () => {
    expect(normalizeQuizDocumentImportSettings({ enabled: true })).toEqual({
      enabled: true,
    });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'enabled'],
    ['an empty object', {}],
    ['a truthy non-boolean', { enabled: 'yes' }],
    ['a number', { enabled: 1 }],
  ])('stays off for %s', (_label, raw) => {
    expect(normalizeQuizDocumentImportSettings(raw)).toEqual({
      enabled: false,
    });
  });
});
