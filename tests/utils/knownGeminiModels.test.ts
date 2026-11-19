import { describe, it, expect } from 'vitest';
import {
  KNOWN_GEMINI_MODELS,
  RETIRED_GEMINI_MODELS,
  currentModelId,
} from '@/config/geminiModels';
import { estimateAiCost, aiModelLabel } from '@/config/aiModels';
import {
  normalizeModelName,
  RETIRED_GEMINI_REPLACEMENTS,
} from '@/functions/src/shared';

describe('KNOWN_GEMINI_MODELS', () => {
  it('offers no model the server would reject', () => {
    const rejected = KNOWN_GEMINI_MODELS.filter(
      (m) => normalizeModelName(m.value) !== m.value
    ).map((m) => m.value);
    expect(rejected).toEqual([]);
  });
});

describe('RETIRED_GEMINI_MODELS', () => {
  it('matches the server replacements', () => {
    expect(
      Object.fromEntries(
        RETIRED_GEMINI_MODELS.map((m) => [m.value, m.replacement])
      )
    ).toEqual(RETIRED_GEMINI_REPLACEMENTS);
  });

  it('replaces each retired model with one still offered', () => {
    const offered = KNOWN_GEMINI_MODELS.map((m) => m.value as string);
    for (const m of RETIRED_GEMINI_MODELS) {
      expect(offered).not.toContain(m.value);
      expect(offered).toContain(m.replacement);
      expect(currentModelId(m.value)).toBe(m.replacement);
      expect(normalizeModelName(m.value)).toBe(m.replacement);
    }
  });

  it('keeps names and prices for past usage', () => {
    expect(aiModelLabel('gemini-4-carbon')).toBe('Gemini 4 Carbon');
    expect(estimateAiCost('gemini-4-argon', '2026-11-30', 1e6, 1e6)).toBe(12);
    expect(estimateAiCost('gemini-4-carbon', '2026-12-01', 1e6, 1e6)).toBe(24);
    expect(estimateAiCost('gemini-4-neon', '2026-12-01', 1e6, 1e6)).toBe(18);
  });
});
