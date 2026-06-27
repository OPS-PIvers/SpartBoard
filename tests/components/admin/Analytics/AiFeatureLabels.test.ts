import { describe, it, expect } from 'vitest';
import { AI_FEATURE_LABELS } from '@/components/admin/Analytics/aiFeatureLabels';

// Mirror of GEMINI_SPECIFIC_FEATURES in functions/src/adminAnalyticsCompute.ts — keep in sync.
// ('guided-learning' is intentionally absent — it writes no ai_usage counter.)
//
// IMPORTANT: Adding a new AI feature requires updating THREE locations atomically.
// Because frontend tests cannot import from functions/src/ (cross-package boundary),
// this list is a manual copy and cannot be derived from the source of truth — so a
// missed update here would otherwise pass silently while the chart shows a raw ID:
//   1. GEMINI_SPECIFIC_FEATURES in functions/src/adminAnalyticsCompute.ts (source of truth)
//   2. AI_FEATURE_LABELS in components/admin/Analytics/aiFeatureLabels.ts
//   3. GEMINI_SPECIFIC_FEATURES in this test file
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
