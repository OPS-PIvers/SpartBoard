import { describe, expect, it } from 'vitest';
import {
  IMPORT_ROUTES,
  IMPORT_FLAGS_ON_ROWS,
  IMPORT_SOURCE_FEATURES,
  IMPORT_TARGET_FEATURES,
  importRowFeature,
} from '@/components/import/importTargets';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import type { ImportTarget } from '@/utils/import/contract';

describe('per-type Import flags', () => {
  it('gives every Import route a launched entry or its own admin-default flag under universal-import', () => {
    for (const target of Object.keys(IMPORT_ROUTES) as ImportTarget[]) {
      const flag = IMPORT_TARGET_FEATURES[target];
      expect(flag, target).toBeDefined();
      if (!flag) continue;
      const def = FEATURE_DEFAULTS[flag];
      expect(def.requires, flag).toBe('universal-import');
      expect(def.defaultAccessLevel, flag).toBe('admin');
      expect(def.missingDocPublic, flag).toBe(false);
    }
  });
});

describe('Import flags shown on rows', () => {
  it('covers every add-on of Import anything, so none is left without a control', () => {
    const addOns = (
      Object.keys(FEATURE_DEFAULTS) as (keyof typeof FEATURE_DEFAULTS)[]
    ).filter((id) => FEATURE_DEFAULTS[id].requires === 'universal-import');
    for (const id of addOns)
      expect(IMPORT_FLAGS_ON_ROWS.has(id), id).toBe(true);
  });

  it('gives each source flag the same shape as the per-type flags', () => {
    for (const flag of Object.values(IMPORT_SOURCE_FEATURES)) {
      const def = FEATURE_DEFAULTS[flag];
      expect(def.requires, flag).toBe('universal-import');
      expect(def.defaultAccessLevel, flag).toBe('admin');
      expect(def.missingDocPublic, flag).toBe(false);
    }
  });

  it('asks a quiz read from a form or a document for the quiz document flag', () => {
    expect(importRowFeature('form', 'quiz')).toBe('quiz-document-import');
    expect(importRowFeature('document', 'quiz')).toBe('quiz-document-import');
    expect(importRowFeature('spreadsheet', 'quiz')).toBeNull();
    expect(importRowFeature('form', 'poll')).toBeNull();
  });
});
