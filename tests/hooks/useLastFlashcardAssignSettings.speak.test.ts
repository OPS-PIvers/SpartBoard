import { describe, expect, it } from 'vitest';
import { parseLastFlashcardAssignSettings } from '@/hooks/useLastFlashcardAssignSettings';

describe('parseLastFlashcardAssignSettings speak', () => {
  it('keeps well-typed Speak rules and clamps attempts', () => {
    const parsed = parseLastFlashcardAssignSettings({
      speak: { preset: 'advanced', strict: true, attempts: 40, example: false },
    });
    expect(parsed?.speak).toEqual({
      preset: 'advanced',
      strict: true,
      attempts: 10,
      example: false,
    });
  });

  it('drops Speak rules with an unknown level', () => {
    const parsed = parseLastFlashcardAssignSettings({
      speak: { preset: 'expert', strict: true, attempts: 3, example: true },
    });
    expect(parsed).not.toHaveProperty('speak');
  });
});
