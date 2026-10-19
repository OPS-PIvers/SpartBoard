import { describe, expect, it } from 'vitest';
import {
  SPEAK_DIALECTS as CLIENT_DIALECTS,
  SPEAK_LANGUAGES,
  SPEAK_PRESET_IDS as CLIENT_PRESETS,
  speakGroupIds,
  speakPresetSettings as clientPreset,
} from '@/config/pronunciationGroups';
import { normalizeFlashcardsSpeakAdminConfig } from '@/config/flashcardsSpeakAdmin';
import { buildSpeakStamp } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  SPEAK_DIALECTS,
  SPEAK_GROUP_IDS,
  SPEAK_PRESET_IDS,
  normalizeSpeakAdminDefaults,
  resolveSpeakSettings,
  speakPresetSettings,
} from '@/functions/src/mcp/flashcardSpeak';
import type { FlashcardSpeakSettings } from '@/types';

describe('connector Speak settings match the client', () => {
  it('copies the dialects, group ids and presets exactly', () => {
    expect(SPEAK_PRESET_IDS).toEqual(CLIENT_PRESETS);
    for (const language of SPEAK_LANGUAGES) {
      expect(SPEAK_DIALECTS[language]).toEqual(CLIENT_DIALECTS[language]);
      expect(SPEAK_GROUP_IDS[language]).toEqual(speakGroupIds(language));
      for (const preset of CLIENT_PRESETS) {
        expect(speakPresetSettings(language, preset)).toEqual(
          clientPreset(language, preset)
        );
      }
    }
  });

  const adminDocs: unknown[] = [
    undefined,
    { attempts: 7, languages: { es: { preset: 'advanced' } } },
    {
      attempts: 'x',
      languages: {
        de: {
          preset: 'intermediate',
          groups: { 'de-r': 'require', nope: 'forgive' },
        },
        en: { preset: 'bogus', groups: { 'en-th': 'maybe' } },
      },
    },
  ];
  const own: Array<Partial<FlashcardSpeakSettings> | undefined> = [
    undefined,
    {
      dialects: ['es-ES', 'de-DE'],
      preset: 'advanced',
      strict: true,
      groups: { 'es-trill': 'require', bogus: 'forgive' },
      attempts: 40,
      example: false,
    },
    { preset: 'weird' as FlashcardSpeakSettings['preset'] },
  ];

  it('resolves a set the same way as buildSpeakStamp', () => {
    for (const raw of adminDocs) {
      const client = normalizeFlashcardsSpeakAdminConfig(raw);
      const server = normalizeSpeakAdminDefaults(raw);
      expect(server.attempts).toBe(client.attempts);
      expect(server.languages).toEqual(client.languages);
      for (const termLanguage of ['es-US', 'de', 'en-GB']) {
        for (const speak of own) {
          const stamp = buildSpeakStamp(
            { termLanguage, speak: speak as FlashcardSpeakSettings },
            true,
            client,
            false
          );
          const { locked: _locked, ...settings } = stamp ?? { locked: false };
          const language = termLanguage.slice(0, 2) as 'es' | 'de' | 'en';
          expect(resolveSpeakSettings(language, speak, server)).toEqual(
            settings
          );
        }
      }
    }
  });
});
