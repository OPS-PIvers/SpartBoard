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
} from '@/functions/src/mcp/flashcardSpeakSettings';
import type { FlashcardCardSpeak, FlashcardSpeakSettings } from '@/types';
import { refsFitDialects } from '@/components/widgets/Flashcards/speak/speakEditorState';
import { cardSpeakCurrent } from '@/functions/src/mcp/flashcardSpeak';
import { SPEAK_G2P_VERSION } from '@/functions/src/pronunciation/g2pVersion';

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
    {
      attempts: 7,
      unclearConfidence: 0.25,
      languages: { es: { preset: 'advanced' } },
    },
    {
      attempts: 'x',
      unclearConfidence: 3,
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
      expect(server.unclearConfidence).toBe(client.unclearConfidence);
      expect(server.languages).toEqual(client.languages);
      for (const termLanguage of ['es-US', 'de', 'en-GB']) {
        for (const speak of own) {
          const stamp = buildSpeakStamp(
            { termLanguage, speak: speak as FlashcardSpeakSettings },
            true,
            client,
            false
          );
          const {
            locked: _locked,
            unclearConfidence,
            ...settings
          } = stamp ?? { locked: false };
          expect(unclearConfidence).toBe(server.unclearConfidence);
          const language = termLanguage.slice(0, 2) as 'es' | 'de' | 'en';
          expect(resolveSpeakSettings(language, speak, server)).toEqual(
            settings
          );
        }
      }
    }
  });

  it('decides which cards fit their accents the same way', () => {
    const r = (dialect: 'es-419' | 'es-ES', source?: 'voice') => ({
      dialect,
      tokens: ['o'],
      stress: [],
      ...(source ? { source } : {}),
    });
    const cases: Array<
      [FlashcardCardSpeak['refs'], FlashcardCardSpeak['reasons']]
    > = [
      [[], undefined],
      [[r('es-419')], undefined],
      [[r('es-419'), r('es-ES')], undefined],
      [[r('es-419'), r('es-419', 'voice')], undefined],
      [[r('es-419')], ['untokenizable']],
      [[r('es-419')], ['g2p-disagree']],
      [[r('es-ES', 'voice')], undefined],
    ];
    const accentSets: Array<Array<'es-419' | 'es-ES'>> = [
      ['es-419'],
      ['es-ES'],
      ['es-419', 'es-ES'],
    ];
    for (const [refs, reasons] of cases) {
      const speak: FlashcardCardSpeak = {
        term: 'hola',
        refs,
        g2pVersion: SPEAK_G2P_VERSION,
        status: refs.length > 0 ? 'ready' : 'unavailable',
        ...(reasons ? { reasons } : {}),
      };
      for (const dialects of accentSets) {
        expect(
          cardSpeakCurrent(
            { id: 'c', term: 'hola', definition: 'd', speak } as never,
            dialects
          )
        ).toBe(refsFitDialects(speak, dialects));
      }
    }
  });
});
