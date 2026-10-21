import { describe, it, expect } from 'vitest';
import * as client from '@/utils/flashcardResults';
import * as server from '@/functions/src/pronunciation/wordsToCheckPool';

describe('Speak words to check cut-offs', () => {
  it('match between Study results and the admin list', () => {
    expect(server.SPEAK_WORDS_TO_CHECK_MIN_STUDENTS).toBe(
      client.SPEAK_WORDS_TO_CHECK_MIN_STUDENTS
    );
    expect(server.SPEAK_WORDS_TO_CHECK_FAIL_SHARE).toBe(
      client.SPEAK_WORDS_TO_CHECK_FAIL_SHARE
    );
  });
});

describe('Speak word keys', () => {
  it('match between the admin list and the fixes students read', async () => {
    const { speakWordKey } = await import('@/utils/pronunciation/wordFixes');
    const { poolSpeakWordsToCheck, parseSpeakCards } =
      await import('@/functions/src/pronunciation/wordsToCheckPool');
    const term = ' Eichhörnchen ';
    const words = poolSpeakWordsToCheck([
      {
        id: 'a',
        termLanguage: 'de-DE',
        definitionLanguage: 'en-US',
        speak: { dialects: ['de-DE'] },
        cards: parseSpeakCards([
          {
            id: 'c1',
            term,
            definition: 'squirrel',
            speak: {
              term,
              refs: [{ dialect: 'de-DE', tokens: ['a'], stress: [] }],
              g2pVersion: 'v1',
              status: 'ready',
            },
          },
        ]),
        progress: Array.from({ length: 5 }, (_, i) => ({
          studentUid: `s${i}`,
          lastActiveAt: 1,
          speak: { c1: { s: 0, c: 0, w: 1 } },
        })),
      },
    ]);
    expect(words[0].key).toBe(speakWordKey('de', term));
  });
});
