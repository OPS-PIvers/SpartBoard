import { describe, expect, it } from 'vitest';
import {
  edpuzzleLessonId,
  htmlText,
  lessonBlocks,
  lessonFromEdpuzzle,
  readEdpuzzleLesson,
} from './lesson';
import youtubeLesson from './fixtures/youtubeLesson.json';

const ID = '603babc9e9387642b1bc2659';

const html = (s: string) => [{ text: '', html: s }];
const lesson = (over: Record<string, unknown> = {}) => ({
  title: 'Climate',
  source: 'youtube',
  videoId: 'WjqqUjDkh1c',
  originalVideoDuration: 200,
  sections: [{ time: 0, duration: 200 }],
  questions: [],
  notes: [],
  ...over,
});

describe('edpuzzleLessonId', () => {
  it.each([
    [`https://edpuzzle.com/media/${ID}`, ID],
    [`https://edpuzzle.com/media/${ID}/edit?x=1`, ID],
    [`https://www.edpuzzle.com/media/${ID}`, ID],
    ['https://edpuzzle.com/media/abc', null],
    [`https://edpuzzle.com/assignments/${ID}/watch`, null],
    [`https://evil.example/media/${ID}`, null],
    ['not a url', null],
  ])('%s', (href, id) => {
    expect(edpuzzleLessonId(href)).toBe(id);
  });
});

describe('htmlText', () => {
  it('keeps line breaks, decodes entities and runs nothing', () => {
    expect(
      htmlText(
        '<p>&icirc;n acelaşi&nbsp;timp</p><p>a &amp; b<br>c</p><img src=x onerror=alert(1)>'
      )
    ).toBe('în acelaşi timp\na & b\nc');
  });
});

describe('lessonFromEdpuzzle', () => {
  it('reads the real YouTube lesson', () => {
    const read = lessonFromEdpuzzle(youtubeLesson);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.title).toBe('YouTube video');
    expect(read.video.youtubeId).toBe('WjqqUjDkh1c');
    // Its sections run end to end over the whole video: no trim.
    expect(read.video).not.toHaveProperty('start');
    expect(read.video).not.toHaveProperty('end');
    expect(read.video.stops.map((s) => [s.kind, s.time])).toEqual([
      ['choice', 43.19],
      ['choice', 48.68],
      ['choice', 73.46],
      ['choice', 104.04],
    ]);
    const first = read.video.stops[0];
    expect(first.text).toBe('Cele patru operaţii se efectuează');
    expect(first.kind === 'choice' && first.choices[0]).toEqual({
      text: 'în acelaşi timp',
      correct: false,
    });
  });

  it('refuses a video Edpuzzle hosts itself', () => {
    expect(
      lessonFromEdpuzzle(
        lesson({ source: 'edpuzzle', videoId: 'a'.repeat(24) })
      )
    ).toEqual({ ok: false, why: 'not-youtube' });
  });

  it('turns the kept sections into a clip', () => {
    const read = lessonFromEdpuzzle(
      lesson({
        sections: [
          { time: 12, duration: 30 },
          { time: 42, duration: 100.5 },
        ],
      })
    );
    expect(read.ok && read.video).toMatchObject({ start: 12, end: 142.5 });
  });

  it('maps questions and notes in time order and counts what it skipped', () => {
    const read = lessonFromEdpuzzle(
      lesson({
        questions: [
          {
            type: 'multiple-choice',
            time: 30,
            body: html('<p>Weather is...</p>'),
            choices: [
              { body: html('<p>daily</p>'), isCorrect: true },
              { body: html('<p>yearly</p>'), isCorrect: false },
              { body: html('<p> </p>'), isCorrect: false },
            ],
          },
          { type: 'open-ended', time: 90, body: html('<p>Why?</p>') },
          { type: 'audio', time: 50, body: html('<p>Say it</p>') },
        ],
        notes: [{ time: 10, body: html('<p>Look here</p>') }],
      })
    );
    expect(read).toEqual({
      ok: true,
      title: 'Climate',
      skipped: 1,
      video: {
        youtubeId: 'WjqqUjDkh1c',
        stops: [
          { kind: 'note', time: 10, text: 'Look here' },
          {
            kind: 'choice',
            time: 30,
            text: 'Weather is...',
            choices: [
              { text: 'daily', correct: true },
              { text: 'yearly', correct: false },
            ],
          },
          { kind: 'open', time: 90, text: 'Why?' },
        ],
      },
    });
  });
});

describe('lessonBlocks', () => {
  it('writes the lesson as numbered questions with their options', () => {
    expect(
      lessonBlocks('Climate', {
        youtubeId: 'WjqqUjDkh1c',
        stops: [
          { kind: 'note', time: 65, text: 'Look' },
          {
            kind: 'choice',
            time: 70,
            text: 'Pick',
            choices: [{ text: 'A', correct: false }],
          },
          { kind: 'open', time: 80, text: 'Why?' },
        ],
      })
    ).toEqual([
      { type: 'heading', level: 1, text: 'Climate' },
      { type: 'quote', text: '1:05 Look' },
      { type: 'paragraph', text: '1. Pick' },
      { type: 'listItem', text: 'A' },
      { type: 'paragraph', text: '2. Why?' },
    ]);
  });
});

describe('readEdpuzzleLesson', () => {
  it('reads the lesson from Edpuzzle with its id', async () => {
    let asked = '';
    const read = await readEdpuzzleLesson(ID, (url) => {
      asked = url;
      return Promise.resolve(youtubeLesson);
    });
    expect(asked).toBe(`https://edpuzzle.com/api/v3/media/${ID}`);
    expect(read.ok && read.blocks[0]).toEqual({
      type: 'heading',
      level: 1,
      text: 'YouTube video',
    });
  });

  it('reports a failed read so Send can fall back', async () => {
    expect(
      await readEdpuzzleLesson(ID, () => Promise.reject(new Error('403')))
    ).toEqual({ ok: false, why: 'unreadable', reason: '403' });
    expect(
      await readEdpuzzleLesson(ID, () => Promise.resolve(lesson()))
    ).toEqual({
      ok: false,
      why: 'unreadable',
      reason: 'no questions or notes',
    });
  });
});
