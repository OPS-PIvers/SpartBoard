import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { formatFlashcardsSpeakValue } from './flashcardsSpeakValue';

const t = ((_key: string, fallback: string) =>
  fallback) as unknown as TFunction;

describe('formatFlashcardsSpeakValue', () => {
  it('summarises the Speak step for the closed row', () => {
    expect(formatFlashcardsSpeakValue({ show: true, lock: false }, t)).toBe(
      'On'
    );
    expect(formatFlashcardsSpeakValue({ show: true, lock: true }, t)).toBe(
      'On, locked'
    );
    expect(formatFlashcardsSpeakValue({ show: false, lock: true }, t)).toBe(
      'Off'
    );
  });
});
