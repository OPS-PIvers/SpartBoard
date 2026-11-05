import { describe, expect, it } from 'vitest';
import { speakPresetSettings } from '@/config/pronunciationGroups';
import { withSpeakChoice } from './flashcardAssign';

const choice = {
  preset: 'beginner' as const,
  strict: false,
  groups: { 'en-th': 'forgive' as const },
  attempts: 4,
  example: false,
};

describe('withSpeakChoice', () => {
  it('rebuilds a named level’s groups for the set’s current language', () => {
    const set = withSpeakChoice({ termLanguage: 'es-MX' }, choice);
    expect(set.speak).toMatchObject({
      preset: 'beginner',
      attempts: 4,
      example: false,
      groups: speakPresetSettings('es', 'beginner').groups,
    });
  });

  it('turns a Custom level from another language into Intermediate', () => {
    const set = withSpeakChoice(
      { termLanguage: 'es-MX' },
      { ...choice, preset: 'custom' }
    );
    expect(set.speak).toMatchObject({
      preset: 'intermediate',
      groups: speakPresetSettings('es', 'intermediate').groups,
    });
  });

  it('leaves the set alone without a choice', () => {
    const set = { termLanguage: 'es-MX' };
    expect(withSpeakChoice(set, undefined)).toBe(set);
  });
});
