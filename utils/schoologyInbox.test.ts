import { describe, it, expect } from 'vitest';
import type { QuizQuestion } from '@/types';
import {
  behaviorFromSettings,
  claimSchoologyReviewParam,
  keepQuestionTags,
  parseInboxItem,
  planInboxRows,
  settingsSummary,
} from './schoologyInbox';

const doc = (over: Record<string, unknown> = {}) => ({
  source: { kind: 'testQuiz', itemId: '8629405092', sectionId: '7595131723' },
  folderPath: ['Model Course: Hour 1'],
  quiz: {
    title: 'Sample Test/Quiz',
    warnings: [],
    questions: [
      {
        number: 1,
        text: 'Pick one',
        type: 'MC',
        options: [{ letter: 'A', text: 'Yes' }],
        correctAnswer: 'Yes',
        imageIds: ['https://x.schoology.com/file_download/1'],
        warnings: [],
        points: 2,
      },
      {
        number: 2,
        text: 'The _ is _',
        type: 'FIB',
        options: [],
        correctAnswer: '',
        imageIds: [],
        warnings: [],
        blankAlternates: [{ answers: ['sky'] }, { answers: [] }],
      },
      { number: 3, text: 'Bad', type: 'hotspot' },
    ],
  },
  unsupported: [],
  settings: { shuffleQuestions: true, attempts: 2 },
  images: [
    {
      id: 'https://x.schoology.com/file_download/1',
      path: 'schoology_import/u/testQuiz_8629405092/s/0',
      contentType: 'image/png',
      name: 'pic.png',
    },
  ],
  receivedAt: 5,
  ...over,
});

describe('parseInboxItem', () => {
  it('reads questions, unpacks blank answers and drops unknown types', () => {
    const item = parseInboxItem('testQuiz_8629405092', doc());
    expect(item?.quiz.questions).toHaveLength(2);
    expect(item?.quiz.questions[1].blankAlternates).toEqual([
      { answers: ['sky'] },
      { answers: [] },
    ]);
    expect(item?.quiz.questions[0].points).toBe(2);
    expect(item?.images[0].path).toContain('schoology_import/');
  });

  it('refuses an entry without a usable source', () => {
    expect(
      parseInboxItem('x', doc({ source: { kind: 'page', itemId: '1' } }))
    ).toBeNull();
    expect(parseInboxItem('x', null)).toBeNull();
  });
});

describe('planInboxRows', () => {
  it('counts what to check and finds the earlier copy by source', () => {
    const quiz = parseInboxItem('testQuiz_8629405092', doc());
    const bank = parseInboxItem(
      'questionBank_9',
      doc({
        source: { kind: 'questionBank', itemId: '9' },
        folderPath: [],
        receivedAt: 9,
      })
    );
    if (!quiz || !bank) throw new Error('parse failed');
    const earlier = {
      id: 'q1',
      title: 'Old copy',
      driveFileId: 'd1',
      sourceKey: 'schoology:testQuiz:8629405092',
    };
    const rows = planInboxRows([quiz, bank], [earlier], [earlier]);
    expect(rows.map((r) => r.item.id)).toEqual([
      'questionBank_9',
      'testQuiz_8629405092',
    ]);
    expect(rows[0]).toMatchObject({ existing: null, path: ['From Schoology'] });
    expect(rows[1]).toMatchObject({
      existing: earlier,
      needsKeyCount: 1,
      flaggedCount: 1,
      path: ['Model Course: Hour 1'],
    });
  });
});

describe('settings', () => {
  it('names and applies what SpartBoard has', () => {
    const settings = {
      shuffleQuestions: true,
      timeLimitMinutes: 30,
      attempts: 2,
    };
    expect(settingsSummary(settings)).toEqual([
      '30 minutes time limit',
      '2 attempts',
      'Shuffled questions',
    ]);
    const behavior = behaviorFromSettings(settings);
    expect(behavior?.attemptLimit).toBe(2);
    expect(behavior?.sessionOptions.shuffleQuestions).toBe(true);
    expect(behavior?.sessionOptions.timeLimitMinutes).toBe(30);
    expect(behaviorFromSettings({})).toBeUndefined();
  });
});

describe('keepQuestionTags', () => {
  it('keeps tags only where the prompt is unchanged', () => {
    const q = (id: string, text: string, tagged = false): QuizQuestion => ({
      id,
      text,
      type: 'MC',
      timeLimit: 0,
      correctAnswer: 'a',
      incorrectAnswers: [],
      ...(tagged
        ? { targets: [{ id: 't1', kind: 'personal', label: 'Target' }] }
        : {}),
    });
    const kept = keepQuestionTags(
      [q('a', 'Same  prompt', true), q('b', 'Old wording', true)],
      [q('x', 'same prompt'), q('y', 'New wording')]
    );
    expect(kept[0].targets?.[0].id).toBe('t1');
    expect(kept[1].targets).toBeUndefined();
  });
});

describe('claimSchoologyReviewParam', () => {
  it('opens once and strips the parameter', () => {
    window.history.replaceState(null, '', '/?schoologyImport=1&x=2');
    expect(claimSchoologyReviewParam()).toBe(true);
    expect(window.location.search).toBe('?x=2');
    window.history.replaceState(null, '', '/?schoologyImport=1');
    expect(claimSchoologyReviewParam()).toBe(false);
  });
});
