import { describe, expect, it } from 'vitest';
import { videoContentFromLesson } from './videoActivityImport';
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

  it('brings only the questions when note stops and clips are off', () => {
    const out = videoContentFromLesson(LESSON, { stops: false });
    expect(out.notes).toEqual([]);
    expect(out).not.toHaveProperty('clip');
    expect(out.questions).toHaveLength(4);
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
