import { describe, expect, it } from 'vitest';
import { parseImportInboxItem } from './inbox';

const stored = (over: Record<string, unknown> = {}) => ({
  url: 'https://edpuzzle.com/media/603babc9e9387642b1bc2659',
  title: 'Climate',
  platform: 'edpuzzle',
  selectionOnly: false,
  blocks: [{ type: 'paragraph', text: '1. Weather is...' }],
  images: [],
  receivedAt: 5,
  ...over,
});

describe('parseImportInboxItem', () => {
  it('keeps a stored video lesson', () => {
    const video = {
      youtubeId: 'WjqqUjDkh1c',
      start: 2,
      end: 90,
      stops: [
        {
          kind: 'choice',
          time: 10,
          text: 'Weather is...',
          choices: [{ text: 'daily', correct: true }, { text: 'yearly' }],
        },
        { kind: 'open', time: 20, text: 'Why?', image: 'https://a.b/c.png' },
        { kind: 'note', time: 30, text: 'Look', image: 'javascript:alert(1)' },
        { kind: 'choice', time: 40, text: 'Empty', choices: [] },
        { kind: 'audio', time: 50, text: 'x' },
      ],
    };
    expect(parseImportInboxItem('a', stored({ video }))?.video).toEqual({
      youtubeId: 'WjqqUjDkh1c',
      start: 2,
      end: 90,
      stops: [
        {
          kind: 'choice',
          time: 10,
          text: 'Weather is...',
          choices: [
            { text: 'daily', correct: true },
            { text: 'yearly', correct: false },
          ],
        },
        { kind: 'open', time: 20, text: 'Why?', image: 'https://a.b/c.png' },
        { kind: 'note', time: 30, text: 'Look' },
      ],
    });
  });

  it('leaves out a missing or malformed video', () => {
    expect(parseImportInboxItem('a', stored())).not.toHaveProperty('video');
    expect(
      parseImportInboxItem(
        'a',
        stored({ video: { youtubeId: 'bad', stops: [] } })
      )
    ).not.toHaveProperty('video');
  });
});
