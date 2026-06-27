import { describe, it, expect } from 'vitest';
import { AI_FEATURE_LABELS } from '@/components/admin/Analytics/aiFeatureLabels';

// Mirror of GEMINI_SPECIFIC_FEATURES in functions/src/adminAnalyticsCompute.ts — keep in sync.
// ('guided-learning' is intentionally absent — it writes no ai_usage counter.)
const GEMINI_SPECIFIC_FEATURES = [
  'smart-poll',
  'embed-mini-app',
  'video-activity-audio-transcription',
  'quiz',
  'ocr',
  'blooms-ai',
  'video-activity-recommend',
  'dashboard-layout',
  'instructional-routine',
  'widget-builder',
  'widget-explainer',
] as const;

describe('AI_FEATURE_LABELS', () => {
  it('has a human-readable label for every tracked Gemini feature', () => {
    const missing: string[] = [];

    for (const featureId of GEMINI_SPECIFIC_FEATURES) {
      const label = AI_FEATURE_LABELS[featureId];
      if (!label || label === featureId) {
        missing.push(featureId);
      }
    }

    expect(
      missing,
      `Missing friendly labels for: ${missing.join(', ')}`
    ).toHaveLength(0);
  });

  it('contains exactly the expected feature IDs (no stale entries)', () => {
    const labelKeys = Object.keys(AI_FEATURE_LABELS).sort();
    const expectedKeys = [...GEMINI_SPECIFIC_FEATURES].sort();
    expect(labelKeys).toEqual(expectedKeys);
  });
});
