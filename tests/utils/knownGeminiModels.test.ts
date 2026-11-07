import { describe, it, expect } from 'vitest';
import { KNOWN_GEMINI_MODELS } from '@/config/geminiModels';
import { normalizeModelName } from '@/functions/src/shared';

describe('KNOWN_GEMINI_MODELS', () => {
  it('offers no model the server would reject', () => {
    const rejected = KNOWN_GEMINI_MODELS.filter(
      (m) => normalizeModelName(m.value) !== m.value
    ).map((m) => m.value);
    expect(rejected).toEqual([]);
  });
});
