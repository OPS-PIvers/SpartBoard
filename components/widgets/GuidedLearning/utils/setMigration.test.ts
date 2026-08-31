import { describe, expect, it } from 'vitest';
import { GL_SET_SCHEMA_VERSION, isGuidedLearningSetV2 } from './setMigration';

describe('isGuidedLearningSetV2', () => {
  it('treats absent and v1 schemaVersion as legacy', () => {
    expect(isGuidedLearningSetV2({})).toBe(false);
    expect(isGuidedLearningSetV2({ schemaVersion: undefined })).toBe(false);
    expect(isGuidedLearningSetV2({ schemaVersion: 1 })).toBe(false);
  });

  it('treats v2 and above as v2', () => {
    expect(isGuidedLearningSetV2({ schemaVersion: 2 })).toBe(true);
    expect(isGuidedLearningSetV2({ schemaVersion: 3 })).toBe(true);
    expect(GL_SET_SCHEMA_VERSION).toBe(2);
  });
});
