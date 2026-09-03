import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// Keys QuestionsScreen (QuizResults.tsx) calls without a defaultValue.
const REQUIRED_KEYS = ['gradedOf', 'notGradedYet', 'barLabel'] as const;

const locales = { en, de, es, fr } as const;

describe('quizResults.stats locale keys', () => {
  for (const [name, locale] of Object.entries(locales)) {
    it(`${name} has every quizResults.stats key`, () => {
      const stats = (
        locale as { quizResults?: { stats?: Record<string, string> } }
      ).quizResults?.stats;
      expect(stats, `${name}.quizResults.stats missing`).toBeDefined();
      const present = stats ?? {};
      for (const key of REQUIRED_KEYS) {
        expect(
          present,
          `${name}.quizResults.stats.${key} missing`
        ).toHaveProperty(key);
        expect(present[key].trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('keeps the interpolation placeholders in every locale', () => {
    for (const [name, locale] of Object.entries(locales)) {
      const stats = (locale as typeof en).quizResults.stats;
      expect(stats.gradedOf, name).toContain('{{n}}');
      expect(stats.gradedOf, name).toContain('{{m}}');
      expect(stats.barLabel, name).toContain('{{pct}}');
    }
  });
});
