import { describe, it, expect } from 'vitest';
import { ttsLanguageForTranslationLocale } from '@/config/quizReadAloud';
import { getWidgetGradeLevels } from '@/config/widgetGradeLevels';
import type { WidgetType } from '@/types';

describe('prototype-key lookups', () => {
  it('ttsLanguageForTranslationLocale ignores inherited keys', () => {
    expect(ttsLanguageForTranslationLocale('constructor')).toBeNull();
    expect(ttsLanguageForTranslationLocale('es')).toBe('es-US');
  });

  it('getWidgetGradeLevels falls back for inherited keys', () => {
    expect(() =>
      getWidgetGradeLevels('toString' as unknown as WidgetType)
    ).not.toThrow();
  });
});
