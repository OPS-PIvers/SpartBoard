import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), { FieldValue: {} }),
}));

import { missingDocDeniesNonAdmin, specificFeatureIdFor } from './aiGeneration';

describe('specificFeatureIdFor', () => {
  it('charges each widget its own switch for shared types', () => {
    expect(specificFeatureIdFor('mini-app', 'mini-app')).toBe('mini-app-ai');
    expect(specificFeatureIdFor('ocr', 'drawing')).toBe('drawing-ai');
    expect(specificFeatureIdFor('ocr', 'webcam')).toBe('webcam-ai');
  });

  it('keeps the old ids for callers that send no source', () => {
    expect(specificFeatureIdFor('mini-app', undefined)).toBe('embed-mini-app');
    expect(specificFeatureIdFor('ocr', undefined)).toBe('ocr');
  });

  it('refuses a source it does not know instead of falling back', () => {
    expect(() => specificFeatureIdFor('ocr', 'anything-else')).toThrow(
      'Unknown AI source.'
    );
    expect(() => specificFeatureIdFor('ocr', 'mini-app')).toThrow();
    expect(() => specificFeatureIdFor('mini-app', 'drawing')).toThrow();
  });

  it('folds video recommendations into the Video Activity AI switch', () => {
    expect(specificFeatureIdFor('video-activity-recommend', undefined)).toBe(
      'video-activity-ai'
    );
    expect(specificFeatureIdFor('quiz', undefined)).toBe('quiz');
    expect(specificFeatureIdFor('poll', undefined)).toBe('smart-poll');
    expect(specificFeatureIdFor('unknown', undefined)).toBeNull();
  });
});

describe('missingDocDeniesNonAdmin', () => {
  it('keeps Bloom’s AI closed to teachers until an admin saves its switch', () => {
    expect(
      missingDocDeniesNonAdmin(specificFeatureIdFor('blooms-ai', undefined)!)
    ).toBe(true);
  });

  it('leaves features that default open alone', () => {
    for (const [type, source] of [
      ['quiz', undefined],
      ['poll', undefined],
      ['mini-app', 'mini-app'],
      ['ocr', 'drawing'],
      ['ocr', 'webcam'],
      ['video-activity-recommend', undefined],
      ['dashboard-layout', undefined],
    ] as const) {
      expect(
        missingDocDeniesNonAdmin(specificFeatureIdFor(type, source)!)
      ).toBe(false);
    }
  });
});
