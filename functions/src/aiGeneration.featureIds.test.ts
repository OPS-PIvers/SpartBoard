import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), { FieldValue: {} }),
}));

import { specificFeatureIdFor } from './aiGeneration';

describe('specificFeatureIdFor', () => {
  it('charges each widget its own switch for shared types', () => {
    expect(specificFeatureIdFor('mini-app', 'mini-app')).toBe('mini-app-ai');
    expect(specificFeatureIdFor('ocr', 'drawing')).toBe('drawing-ai');
    expect(specificFeatureIdFor('ocr', 'webcam')).toBe('webcam-ai');
  });

  it('keeps the old ids for callers that send no source', () => {
    expect(specificFeatureIdFor('mini-app', undefined)).toBe('embed-mini-app');
    expect(specificFeatureIdFor('ocr', undefined)).toBe('ocr');
    expect(specificFeatureIdFor('ocr', 'anything-else')).toBe('ocr');
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
