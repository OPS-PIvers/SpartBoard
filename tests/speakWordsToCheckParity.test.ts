import { describe, it, expect } from 'vitest';
import * as client from '@/utils/flashcardResults';
import * as server from '@/functions/src/pronunciation/wordsToCheck';

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
