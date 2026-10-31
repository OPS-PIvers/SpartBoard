import { describe, expect, it } from 'vitest';
import type { ImportInboxItem } from './contract';
import {
  guessTargets,
  looksLikeQuestions,
  looksLikeTwoColumns,
} from './guessTargets';

const QUESTIONS = [
  '1. What is evaporation?',
  'a) Water turning to gas',
  'b) Rain',
  '2. What is condensation?',
  '3. What is runoff?',
];

const send = (over: Partial<ImportInboxItem> = {}): ImportInboxItem => ({
  id: 'x',
  url: 'https://www.example.org/lesson',
  title: 'Lesson',
  platform: 'generic',
  selectionOnly: false,
  blocks: [{ type: 'paragraph', text: 'Water moves around the earth.' }],
  images: [],
  receivedAt: 0,
  ...over,
});

describe('signals', () => {
  it('spots numbered questions', () => {
    expect(looksLikeQuestions(QUESTIONS)).toBe(true);
    expect(
      looksLikeQuestions(['1. Step one', '2. Step two', '3. Step three'])
    ).toBe(false);
  });

  it('spots two columns', () => {
    expect(looksLikeTwoColumns(['a\tb', 'c\td', 'e\tf'])).toBe(true);
    expect(
      looksLikeTwoColumns(
        [],
        [
          {
            type: 'table',
            rows: [
              { cells: ['a', 'b'] },
              { cells: ['c', 'd'] },
              { cells: ['e', 'f'] },
            ],
          },
        ]
      )
    ).toBe(true);
    expect(looksLikeTwoColumns(['a\tb\tc', 'd\te\tf', 'g\th\ti'])).toBe(false);
  });
});

describe('guessTargets', () => {
  it('always preselects one of its targets', () => {
    const sources = [
      { kind: 'file', fileName: 'unit.pptx', mimeType: '' },
      {
        kind: 'file',
        fileName: 'quiz.pdf',
        mimeType: 'application/pdf',
        text: QUESTIONS.join('\n'),
      },
      { kind: 'file', fileName: 'notes.pdf', mimeType: 'application/pdf' },
      { kind: 'file', fileName: 'photo.jpg', mimeType: 'image/jpeg' },
      { kind: 'file', fileName: 'course.imscc', mimeType: '' },
      { kind: 'file', fileName: 'lesson.gl.json', mimeType: '' },
      {
        kind: 'file',
        fileName: 'vocab.csv',
        mimeType: 'text/csv',
        text: 'a,b\nc,d\ne,f',
      },
      { kind: 'url', url: 'https://youtu.be/abc' },
      { kind: 'url', url: 'https://docs.google.com/presentation/d/1/edit' },
      { kind: 'url', url: 'not a url' },
      { kind: 'text', text: 'Why do seasons change?' },
      { kind: 'send', item: send() },
      { kind: 'send', item: send({ selectionOnly: true }) },
    ] as const;
    for (const s of sources) {
      const g = guessTargets(s);
      expect(g.targets).toContain(g.guess);
    }
  });

  it('guesses from the Source', () => {
    expect(
      guessTargets({ kind: 'file', fileName: 'Unit.PPTX', mimeType: '' }).guess
    ).toBe('notebook');
    expect(
      guessTargets({
        kind: 'file',
        fileName: 'q.pdf',
        mimeType: 'application/pdf',
        text: QUESTIONS.join('\n'),
      }).guess
    ).toBe('quiz');
    expect(
      guessTargets({
        kind: 'file',
        fileName: 'n.pdf',
        mimeType: 'application/pdf',
      }).guess
    ).toBe('pdf');
    expect(
      guessTargets({ kind: 'file', fileName: 'p.jpg', mimeType: 'image/jpeg' })
        .guess
    ).toBe('sticker');
    expect(
      guessTargets({
        kind: 'file',
        fileName: 'v.csv',
        mimeType: 'text/csv',
        text: 'a,b\nc,d\ne,f',
      }).guess
    ).toBe('flashcards');
    expect(
      guessTargets({ kind: 'url', url: 'https://www.youtube.com/watch?v=1' })
        .guess
    ).toBe('embed');
    expect(
      guessTargets({
        kind: 'url',
        url: 'https://docs.google.com/forms/d/1/viewform',
      }).guess
    ).toBe('quiz');
    expect(
      guessTargets({ kind: 'text', text: 'Why do seasons change?' }).guess
    ).toBe('activityWall');
    expect(guessTargets({ kind: 'text', text: 'a\tb\nc\td\ne\tf' }).guess).toBe(
      'flashcards'
    );
  });

  it('guesses a sent page from its content', () => {
    expect(guessTargets({ kind: 'send', item: send() }).guess).toBe('embed');
    const quiz = send({
      blocks: QUESTIONS.map((text) => ({ type: 'listItem' as const, text })),
    });
    expect(guessTargets({ kind: 'send', item: quiz }).guess).toBe('quiz');
  });

  it('puts a sent video lesson first as a Video activity', () => {
    const g = guessTargets({
      kind: 'send',
      item: send({ video: { youtubeId: 'WjqqUjDkh1c', stops: [] } }),
    });
    expect(g.guess).toBe('videoActivity');
    expect(g.targets[0]).toBe('videoActivity');
  });

  it('puts a sent card set first as Flashcards, listed once', () => {
    const g = guessTargets({
      kind: 'send',
      item: send({ cards: { cards: [{ term: 'a', definition: 'b' }] } }),
    });
    expect(g.guess).toBe('flashcards');
    expect(g.targets.filter((t) => t === 'flashcards')).toEqual(['flashcards']);
  });

  it("doesn't offer a selection as a whole-page embed", () => {
    const g = guessTargets({
      kind: 'send',
      item: send({ selectionOnly: true }),
    });
    expect(g.targets).not.toContain('embed');
    expect(g.guess).toBe('flashcards');
  });

  it('keeps a sent YouTube page as a video', () => {
    const g = guessTargets({
      kind: 'send',
      item: send({ url: 'https://www.youtube.com/watch?v=1' }),
    });
    expect(g.targets).toContain('videoActivity');
    expect(g.guess).toBe('embed');
  });
});
