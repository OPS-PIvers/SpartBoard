import { describe, expect, it } from 'vitest';
import { modelReadsInputs } from '@/config/aiModels';

describe('modelReadsInputs', () => {
  it('lets Claude read document import, since Word files fall back to Gemini', () => {
    expect(modelReadsInputs('claude-haiku-5-5', ['pdf', 'docx'])).toBe(true);
  });

  it('keeps Claude off inputs it cannot read', () => {
    expect(modelReadsInputs('claude-haiku-5-5', ['video'])).toBe(false);
    expect(modelReadsInputs('claude-sonnet-5-5', ['audio'])).toBe(false);
    expect(modelReadsInputs('gemini-3.7-flash', ['video'])).toBe(true);
  });
});
