import { describe, expect, it } from 'vitest';
import { leftOutSummary, videoContentFromLesson } from './videoActivityImport';
import type { ImportVideoLesson } from '@/utils/import/contract';

const choice = (text: string, correct = false) => ({ text, correct });

const LESSON: ImportVideoLesson = {
  youtubeId: 'WjqqUjDkh1c',
  start: 12,
  end: 140,
  stops: [
    { kind: 'note', time: 20, text: 'Look here' },
    {
      kind: 'choice',
      time: 30,
      text: 'Weather is...',
      choices: [choice('yearly'), choice('daily', true), choice('never')],
    },
    {
      kind: 'choice',
      time: 40,
      text: 'Pick both',
      choices: [choice('a', true), choice('b', true), choice('c')],
    },
    {
      kind: 'choice',
      time: 50,
      text: 'No key',
      choices: [choice('x'), choice('y')],
    },
    { kind: 'open', time: 60, text: 'Why?' },
  ],
};

describe('videoContentFromLesson', () => {
  it('maps every stop kind and keeps the options in their order', () => {
    const out = videoContentFromLesson(LESSON, { stops: true });
    expect(out.youtubeUrl).toBe('https://www.youtube.com/watch?v=WjqqUjDkh1c');
    expect(out.clip).toEqual({ start: 12, end: 140 });
    expect(out.notes.map(({ timestamp, text }) => [timestamp, text])).toEqual([
      [20, 'Look here'],
    ]);
    const [mc, ma, keyless, sa] = out.questions;
    expect(mc).toMatchObject({
      type: 'MC',
      timestamp: 30,
      correctAnswer: 'daily',
      incorrectAnswers: ['yearly', 'never'],
      optionOrder: [1, 0, 2],
    });
    expect(mc).not.toHaveProperty('needsKey');
    expect(ma).toMatchObject({
      type: 'MA',
      correctAnswer: 'a|b',
      incorrectAnswers: ['c'],
    });
    expect(ma).not.toHaveProperty('optionOrder');
    expect(keyless).toMatchObject({
      type: 'MC',
      correctAnswer: '',
      incorrectAnswers: ['x', 'y'],
      needsKey: true,
    });
    expect(sa).toMatchObject({ type: 'SA', correctAnswer: '', timestamp: 60 });
  });

  it('brings only the choice questions when short answer, notes and clips are off', () => {
    const out = videoContentFromLesson(LESSON, { stops: false });
    expect(out.notes).toEqual([]);
    expect(out).not.toHaveProperty('clip');
    expect(out.questions.map((q) => q.type)).toEqual(['MC', 'MA', 'MC']);
  });

  it('drops wrong options past the editor cap but never a right one', () => {
    const many = Array.from({ length: 8 }, (_, i) => choice(`w${i}`));
    const out = videoContentFromLesson(
      {
        youtubeId: 'WjqqUjDkh1c',
        stops: [
          {
            kind: 'choice',
            time: 5,
            text: 'Lots',
            choices: [...many, choice('right', true)],
          },
        ],
      },
      { stops: true }
    );
    expect(out.questions[0].correctAnswer).toBe('right');
    expect(out.questions[0].incorrectAnswers).toEqual(['w0', 'w1', 'w2', 'w3']);
  });
});

describe('videoContentFromLesson pictures', () => {
  it('points a stop at its copied picture and drops one that was not copied', () => {
    const out = videoContentFromLesson(
      {
        youtubeId: 'WjqqUjDkh1c',
        stops: [
          {
            kind: 'open',
            time: 1,
            text: 'A',
            image: 'https://a.example/1.png',
          },
          {
            kind: 'note',
            time: 2,
            text: 'B',
            image: 'https://a.example/1.png',
          },
          {
            kind: 'open',
            time: 3,
            text: 'C',
            image: 'https://a.example/x.png',
          },
        ],
      },
      {
        stops: true,
        pictures: new Map([['https://a.example/1.png', 'drive-file-1']]),
      }
    );
    expect(out.questions[0].imageDriveFileId).toBe('drive-file-1');
    expect(out.notes[0].imageDriveFileId).toBe('drive-file-1');
    expect(out.questions[1]).not.toHaveProperty('imageDriveFileId');
  });
});

describe('leftOutSummary', () => {
  it('lists what was left out in one sentence', () => {
    expect(leftOutSummary({})).toBe(null);
    expect(leftOutSummary({ voiceover: 1 })).toBe(
      'Left out: voiceover narration.'
    );
    expect(leftOutSummary({ cut: 1, question: 2, feedback: 3 })).toBe(
      'Left out: 2 questions SpartBoard has no kind for, answer feedback and 1 cut in the middle of the video (students see that part).'
    );
  });

  it('names what the preview flag held back', () => {
    const out = videoContentFromLesson(
      {
        youtubeId: 'WjqqUjDkh1c',
        start: 5,
        stops: [
          { kind: 'open', time: 10, text: 'Why?' },
          { kind: 'note', time: 20, text: 'Look' },
        ],
        leftOut: { voiceover: 1 },
      },
      { stops: false }
    );
    expect(out.leftOut).toBe(
      'Left out: 1 short-answer question, 1 note, the start and end times and voiceover narration.'
    );
    expect(videoContentFromLesson(LESSON, { stops: true }).leftOut).toBe(null);
  });
  it('counts answer choices past what a keyless question can hold', () => {
    const out = videoContentFromLesson(
      {
        youtubeId: 'WjqqUjDkh1c',
        stops: [
          {
            kind: 'choice',
            time: 10,
            text: 'Pick',
            choices: Array.from({ length: 7 }, (_, i) => ({
              text: `c${i}`,
              correct: false,
            })),
          },
        ],
      },
      { stops: true }
    );
    expect(out.leftOut).toBe(
      'Left out: 2 answer choices past the most a question can hold.'
    );
  });
});
