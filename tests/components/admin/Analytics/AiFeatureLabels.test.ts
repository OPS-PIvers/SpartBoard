import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { AI_FEATURE_LABELS } from '@/components/admin/Analytics/aiFeatureLabels';

// Read straight from the server source so the two lists can't drift.
const readServerFeatureIds = (): string[] => {
  const source = readFileSync(
    resolve(__dirname, '../../../../functions/src/adminAnalyticsCompute.ts'),
    'utf8'
  );
  const block = /const GEMINI_SPECIFIC_FEATURES = \[([\s\S]*?)\];/.exec(source);
  if (!block) throw new Error('GEMINI_SPECIFIC_FEATURES not found');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe('AI_FEATURE_LABELS', () => {
  const serverIds = readServerFeatureIds();

  it('has a human-readable label for every tracked AI feature', () => {
    const missing = serverIds.filter((id) => {
      const label = AI_FEATURE_LABELS[id];
      return !label || label === id;
    });
    expect(
      missing,
      `Missing friendly labels for: ${missing.join(', ')}`
    ).toHaveLength(0);
  });

  it('contains exactly the server feature IDs (no stale entries)', () => {
    expect(Object.keys(AI_FEATURE_LABELS).sort()).toEqual(
      [...serverIds].sort()
    );
  });
});
