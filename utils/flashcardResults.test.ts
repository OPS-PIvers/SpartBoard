import { describe, expect, it } from 'vitest';
import type { FlashcardSession } from '@/types';
import {
  aggregateSpeakRows,
  aggregateStudyRows,
  buildSpeakRows,
  mostForgivenSounds,
  mostMissedSounds,
  speakClassSounds,
  speakWordsToCheck,
  buildCheckRows,
  buildFlagRows,
  buildStudyRows,
  checkCardAccuracy,
  filterResultsByClass,
  flashcardBucketOf,
  hardestFlashcards,
  type FlashcardResultRecord,
} from './flashcardResults';

const CARDS = [
  { id: 'c1', term: 'el perro', definition: 'dog' },
  { id: 'c2', term: 'la canción', definition: 'song' },
  { id: 'c3', term: 'el gato', definition: 'cat' },
];

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession => ({
  id: 'a1',
  teacherUid: 'teacher-1',
  setId: 'set-1',
  title: 'Spanish',
  kind: 'study',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: CARDS,
  classIds: ['class-1'],
  status: 'active',
  createdAt: 1,
  ...over,
});

const card = (s: number, c = 0, w = 0) => ({ s, due: 1, c, w }) as never;

describe('study aggregation', () => {
  const results: FlashcardResultRecord[] = [
    {
      studentUid: 'a',
      classId: 'class-1',
      studyMs: 600000,
      lastActiveAt: 100,
      modesUsed: ['write'],
      cards: { c1: card(3, 3, 0), c2: card(1, 1, 2), c3: card(0, 0, 1) },
    },
    { studentUid: 'b', classId: 'class-2', studyMs: 0, cards: {} },
  ];

  it('buckets a card by its streak against the threshold', () => {
    expect(flashcardBucketOf(card(0))).toBe('new');
    expect(flashcardBucketOf(card(1))).toBe('learning');
    expect(flashcardBucketOf(card(2))).toBe('familiar');
    expect(flashcardBucketOf(card(3))).toBe('mastered');
    expect(flashcardBucketOf(card(2), 2)).toBe('mastered');
  });

  it('builds per-student rows with buckets, minutes and mastered percent', () => {
    const rows = buildStudyRows(session(), results);
    expect(rows[0]).toMatchObject({
      studentUid: 'a',
      mastered: 1,
      total: 3,
      studyMinutes: 10,
      started: true,
    });
    expect(rows[0].buckets).toEqual({
      new: 1,
      learning: 1,
      familiar: 0,
      mastered: 1,
    });
    expect(Math.round(rows[0].masteredPercent)).toBe(33);
    expect(rows[1].started).toBe(false);
  });

  it('counts students who have not started', () => {
    const aggregate = aggregateStudyRows(buildStudyRows(session(), results));
    expect(aggregate).toMatchObject({ students: 2, started: 1, notStarted: 1 });
    expect(Math.round(aggregate.averageMasteredPercent)).toBe(17);
  });

  it('ranks hardest cards by class-wide misses', () => {
    const hardest = hardestFlashcards(session(), results);
    expect(hardest.map((h) => h.card.id)).toEqual(['c2', 'c3']);
    expect(hardest[0]).toMatchObject({ wrong: 2, strugglingStudents: 1 });
  });

  it('filters by class id', () => {
    expect(filterResultsByClass(results, 'class-2')).toHaveLength(1);
    expect(filterResultsByClass(results, null)).toHaveLength(2);
  });
});

describe('check aggregation', () => {
  const checkSession = session({
    kind: 'check',
    checkMode: 'write',
    lockedSettings: {
      showFirst: 'term',
      shuffle: false,
      favoritesOnly: false,
      hideMastered: false,
      strict: false,
      testTypes: ['fib'],
      testCount: 'all',
    },
  });
  const results: FlashcardResultRecord[] = [
    {
      studentUid: 'a',
      classId: 'class-1',
      submittedAt: 10,
      score: 2,
      total: 3,
      answerLog: [
        { cardId: 'c1', response: 'dog', correct: true },
        { cardId: 'c2', response: 'tune', correct: false },
        { cardId: 'c3', response: 'cat', correct: true },
      ],
      flags: [{ cardId: 'c2', response: 'tune' }],
    },
    { studentUid: 'b', classId: 'class-1' },
  ];

  it('separates submitted students from in-progress ones', () => {
    const rows = buildCheckRows(checkSession, results);
    expect(rows[0]).toMatchObject({
      score: 2,
      total: 3,
      openFlags: 1,
      submittedAt: 10,
    });
    expect(Math.round(rows[0].percent ?? 0)).toBe(67);
    expect(rows[1]).toMatchObject({ score: null, percent: null, total: 3 });
  });

  it('ignores unsubmitted students in first-try accuracy', () => {
    const accuracy = checkCardAccuracy(checkSession, results);
    expect(accuracy[0]).toMatchObject({ percent: 0, answered: 1 });
    expect(accuracy[0].card.id).toBe('c2');
  });

  it('counts an accepted flag as correct in accuracy', () => {
    const accepted = [
      {
        ...results[0],
        flags: [{ cardId: 'c2', response: 'tune', accepted: true }],
      },
      results[1],
    ];
    const accuracy = checkCardAccuracy(checkSession, accepted);
    expect(accuracy.every((entry) => entry.percent === 100)).toBe(true);
  });

  it('pairs each flag with the expected answer', () => {
    const flags = buildFlagRows(checkSession, results);
    expect(flags).toEqual([
      {
        studentUid: 'a',
        cardId: 'c2',
        card: CARDS[1],
        response: 'tune',
        expected: 'song',
        accepted: undefined,
      },
    ]);
  });
});

describe('speak aggregation (F10)', () => {
  const ref = { dialect: 'es-ES' as const, tokens: ['p'], stress: [] };
  const speakable = (id: string, term: string) => ({
    id,
    term,
    definition: id,
    speak: { term, refs: [ref], g2pVersion: 'v1', status: 'ready' as const },
  });
  const SPEAK_CARDS = [
    speakable('s1', 'perro'),
    speakable('s2', 'casa'),
    speakable('s3', 'gato'),
    {
      id: 's4',
      term: 'el perro',
      definition: 'the dog',
      speak: {
        term: 'el perro',
        refs: [],
        g2pVersion: 'v1',
        status: 'unavailable' as const,
        reasons: ['multi-word' as const],
      },
    },
  ];
  const speakSession = session({ cards: SPEAK_CARDS });
  const sp = (s: number, c = 0, w = 0) =>
    ({ s, due: 1, c, w, best: 0, last: 0, tries: 1 }) as never;

  it('counts said well, in progress and not started over speakable cards', () => {
    const [row] = buildSpeakRows(
      speakSession,
      [
        {
          studentUid: 'a',
          speak: { s1: sp(3, 3, 0), s2: sp(1, 1, 1), s4: sp(3, 3, 0) },
          speakSounds: {
            r: { n: 4, m: 3, f: 0 },
            β: { n: 4, m: 1, f: 2 },
            a: { n: 6, m: 1, f: 0 },
            e: { n: 2, m: 2, f: 0 },
            zz: { n: 9, m: 9, f: 0 },
          },
        },
      ],
      'es'
    );
    expect(row).toMatchObject({
      ran: true,
      mastered: 1,
      inProgress: 1,
      notStarted: 1,
      total: 3,
    });
    expect(row.masteredPercent).toBeCloseTo(100 / 3);
    // Unknown tokens are dropped; ties on misses go to the higher miss share.
    expect(row.missedSounds).toEqual(['r', 'e', 'β']);
  });

  it('marks a student whose device never ran Speak', () => {
    const rows = buildSpeakRows(
      speakSession,
      [
        { studentUid: 'a', cards: { s1: card(3, 3, 0) } },
        { studentUid: 'b', speak: { s1: sp(0) }, speakSounds: {} },
      ],
      'es'
    );
    expect(rows.map((row) => row.ran)).toEqual([false, false]);
    const aggregate = aggregateSpeakRows([
      ...rows,
      ...buildSpeakRows(
        speakSession,
        [{ studentUid: 'c', speak: { s1: sp(3, 3, 0) } }],
        'es'
      ),
    ]);
    expect(aggregate).toMatchObject({ students: 3, ran: 1, notRan: 2 });
    expect(aggregate.averageMasteredPercent).toBeCloseTo(100 / 3);
  });

  it('uses the session mastery threshold', () => {
    const [row] = buildSpeakRows(
      session({ cards: SPEAK_CARDS, masteryThreshold: 2 }),
      [{ studentUid: 'a', speak: { s1: sp(2, 2, 0) } }],
      'es'
    );
    expect(row.mastered).toBe(1);
  });

  it('ranks class sounds by misses and by forgiven', () => {
    const totals = speakClassSounds(
      [
        { studentUid: 'a', speakSounds: { r: { n: 2, m: 2, f: 0 } } },
        {
          studentUid: 'b',
          speakSounds: { r: { n: 2, m: 1, f: 1 }, β: { n: 5, m: 0, f: 4 } },
        },
        { studentUid: 'c', speakSounds: { zz: { n: 1, m: 1, f: 1 } } },
      ],
      'es'
    );
    expect(mostMissedSounds(totals)).toEqual([
      { token: 'r', n: 4, m: 3, f: 1 },
    ]);
    expect(mostForgivenSounds(totals).map((sound) => sound.token)).toEqual([
      'β',
      'r',
    ]);
  });

  describe('words to check', () => {
    const students = (
      failed: number,
      passed: number
    ): FlashcardResultRecord[] => [
      ...Array.from({ length: failed }, (_, i) => ({
        studentUid: `f${i}`,
        speak: { s1: sp(0, 0, 2) },
      })),
      ...Array.from({ length: passed }, (_, i) => ({
        studentUid: `p${i}`,
        speak: { s1: sp(1, 1, 1) },
      })),
    ];

    it('needs at least 5 students who tried', () => {
      expect(speakWordsToCheck(speakSession, students(4, 0))).toEqual([]);
      const [word] = speakWordsToCheck(speakSession, students(5, 0));
      expect(word).toMatchObject({ tried: 5, failed: 5 });
      expect(word.card.id).toBe('s1');
    });

    it('needs at least 60% failing their last round', () => {
      expect(speakWordsToCheck(speakSession, students(3, 2))).toHaveLength(1);
      expect(speakWordsToCheck(speakSession, students(2, 3))).toEqual([]);
      expect(speakWordsToCheck(speakSession, students(6, 4))).toHaveLength(1);
      expect(speakWordsToCheck(speakSession, students(5, 4))).toEqual([]);
    });

    it('ignores students who never tried the word and unspeakable cards', () => {
      const untouched = Array.from({ length: 5 }, (_, i) => ({
        studentUid: `u${i}`,
        speak: { s1: sp(0), s4: sp(0, 0, 3) },
      }));
      expect(
        speakWordsToCheck(speakSession, [...students(3, 2), ...untouched])
      ).toHaveLength(1);
      expect(speakWordsToCheck(speakSession, untouched)).toEqual([]);
    });
  });
});
