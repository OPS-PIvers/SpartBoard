import { describe, expect, it } from 'vitest';
import {
  WORD_CLOUD_MAX_WORDS,
  buildWordCloud,
  wordColor,
} from './activityWallWordCloud';

describe('buildWordCloud', () => {
  it('counts words, drops stop words, and normalizes weights', () => {
    const cloud = buildWordCloud([
      { content: 'the brave brave fox' },
      { content: 'fox' },
    ]);
    expect(cloud.map((entry) => entry.word)).toEqual(['brave', 'fox']);
    expect(cloud[0]).toMatchObject({ count: 2, weight: 1 });
    expect(cloud.some((entry) => entry.word === 'the')).toBe(false);
  });

  it('caps the cloud at 80 words', () => {
    const content = Array.from(
      { length: 120 },
      (_, i) => `word${'x'.repeat(i + 1)}`
    ).join(' ');
    expect(buildWordCloud([{ content }])).toHaveLength(WORD_CLOUD_MAX_WORDS);
  });
});

describe('wordColor', () => {
  it('is deterministic per word', () => {
    expect(wordColor('fox')).toBe(wordColor('fox'));
    expect(wordColor('fox')).toMatch(/^hsl\(\d+, 65%, 38%\)$/);
  });
});
