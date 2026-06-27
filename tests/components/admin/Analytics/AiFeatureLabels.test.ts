/**
 * Regression test for AI_FEATURE_LABELS coverage.
 *
 * GEMINI_SPECIFIC_FEATURES in functions/src/adminAnalyticsCompute.ts defines
 * which feature IDs are tracked in the ai_usage collection. Each feature must
 * have a human-readable label in AI_FEATURE_LABELS so admins see friendly
 * names in the AI Feature Breakdown chart instead of raw programmer-ID strings.
 *
 * This test locks in the full expected set. If a new feature is added to
 * GEMINI_SPECIFIC_FEATURES without a corresponding label here the test will
 * fail, prompting the developer to add a label.
 */
import { describe, it, expect } from 'vitest';
import { AI_FEATURE_LABELS } from '@/components/admin/Analytics/aiFeatureLabels';

/**
 * Mirror of GEMINI_SPECIFIC_FEATURES in functions/src/adminAnalyticsCompute.ts.
 * Keep this list in sync when features are added or removed there.
 * Notably, 'guided-learning' was removed in PR #2067.
 */
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

  it('label values differ from their raw feature-ID keys', () => {
    for (const featureId of GEMINI_SPECIFIC_FEATURES) {
      const label = AI_FEATURE_LABELS[featureId];
      expect(
        label,
        `Label for '${featureId}' should not equal the raw key`
      ).not.toBe(featureId);
    }
  });

  it('contains exactly the expected feature IDs (no stale entries)', () => {
    const labelKeys = Object.keys(AI_FEATURE_LABELS).sort();
    const expectedKeys = [...GEMINI_SPECIFIC_FEATURES].sort();
    expect(labelKeys).toEqual(expectedKeys);
  });
});
