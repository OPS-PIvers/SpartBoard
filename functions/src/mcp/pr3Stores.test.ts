import { describe, expect, it } from 'vitest';
import {
  assertYouTubeUrl,
  buildVideoMetadata,
  orderByTimestamp,
  toFriendlyVideoQuestion,
  toStoredVideoQuestion,
  type VideoQuestion,
} from './videoStore';
import { buildCriteria, rubricDoc, rubricMaxPoints } from './rubricTools';
import {
  defaultWall,
  finalizeWall,
  sessionMirror,
  toSections,
} from './wallTools';
import { assertHtml } from './miniAppTools';
import {
  MIN_RESPONSES,
  formatSummary,
  suppressed,
  videoAskedScope,
  videoKeyForGrader,
} from './resultsTools';
import {
  computeAssessmentAggregate,
  resolveGroupQuestions,
} from '../plcAssessmentMath';

let seq = 0;
const newId = () => `new-${(seq += 1)}`;

describe('video activity mirror', () => {
  it('stores FIB alternates as acceptableVariants and defaults a new time limit to 30', () => {
    const q = toStoredVideoQuestion(
      {
        type: 'fill_in_blank',
        text: 'Capital of France?',
        timestamp_seconds: 42.7,
        correct_answer: 'Paris',
        accepted_alternates: ['paris, france'],
      },
      1,
      undefined,
      newId
    );
    expect(q).toMatchObject({
      type: 'FIB',
      timestamp: 42,
      timeLimit: 30,
      correctAnswer: 'Paris',
      acceptableVariants: ['paris, france'],
    });
    expect(q.alternateAnswers).toBeUndefined();
    expect(toFriendlyVideoQuestion(q)).toMatchObject({
      type: 'fill_in_blank',
      timestamp_seconds: 42,
      accepted_alternates: ['paris, france'],
    });
  });

  it('keeps an edited question id and time limit but replaces old variants', () => {
    const existing: VideoQuestion = {
      id: 'q1',
      timeLimit: 45,
      text: 'Old',
      type: 'FIB',
      correctAnswer: 'a',
      incorrectAnswers: [],
      acceptableVariants: ['old'],
      timestamp: 5,
    };
    const q = toStoredVideoQuestion(
      {
        type: 'multiple_choice',
        text: 'New',
        timestamp_seconds: 9,
        correct_answer: 'x',
        incorrect_answers: ['y'],
      },
      1,
      existing,
      newId
    );
    expect(q).toMatchObject({ id: 'q1', timeLimit: 45, timestamp: 9 });
    expect(q.acceptableVariants).toBeUndefined();
  });

  it('sorts by timestamp and nudges duplicates forward like the editor', () => {
    const q = (id: string, timestamp: number) =>
      ({ id, timestamp }) as VideoQuestion;
    expect(
      orderByTimestamp([q('a', 10), q('b', 5), q('c', 10), q('d', 11)]).map(
        (x) => [x.id, x.timestamp]
      )
    ).toEqual([
      ['b', 5],
      ['a', 10],
      ['c', 11],
      ['d', 12],
    ]);
  });

  it('accepts YouTube links only', () => {
    expect(assertYouTubeUrl(' https://youtu.be/dQw4w9WgXcQ ')).toBe(
      'https://youtu.be/dQw4w9WgXcQ'
    );
    expect(() => assertYouTubeUrl('https://vimeo.com/123')).toThrow();
  });

  it('keeps folder, sync, behavior and order on the metadata doc', () => {
    const meta = buildVideoMetadata(
      {
        id: 'v',
        title: 'T',
        youtubeUrl: 'u',
        questions: [],
        createdAt: 1,
        updatedAt: 2,
      },
      'file',
      { folderId: 'f', behavior: { sessionMode: 'auto' }, order: 3 },
      { claudeEditedAt: 9 }
    );
    expect(meta).toEqual({
      id: 'v',
      title: 'T',
      youtubeUrl: 'u',
      driveFileId: 'file',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 2,
      folderId: 'f',
      behavior: { sessionMode: 'auto' },
      order: 3,
      claudeEditedAt: 9,
    });
  });
});

describe('rubric mirror', () => {
  const levels = [
    { label: 'Beginning', points: 1 },
    { label: 'Proficient', points: 3 },
  ];

  it('validates like the rubric builder and sorts levels low to high', () => {
    const [c] = buildCriteria(
      [
        {
          name: 'Thesis',
          levels: [
            { label: 'High', points: 4 },
            { label: 'Low', points: 0 },
          ],
        },
      ],
      [],
      newId
    );
    expect(c.levels.map((l) => l.label)).toEqual(['Low', 'High']);
    expect(() =>
      buildCriteria([{ name: 'X', levels: [levels[0]] }], [], newId)
    ).toThrow();
    expect(() =>
      buildCriteria(
        [
          {
            name: 'X',
            levels: [
              { label: 'a', points: 1 },
              { label: 'b', points: 1 },
            ],
          },
        ],
        [],
        newId
      )
    ).toThrow();
  });

  it('reuses criterion and level ids so existing grades still line up', () => {
    const previous = [
      {
        id: 'c1',
        name: 'Old',
        levels: [
          { id: 'l1', label: 'a', points: 0 },
          { id: 'l2', label: 'b', points: 2 },
        ],
      },
    ];
    const [c] = buildCriteria(
      [
        {
          id: 'c1',
          name: 'New',
          levels: [
            { id: 'l1', label: 'a', points: 0 },
            { id: 'bogus', label: 'c', points: 5 },
          ],
        },
      ],
      previous,
      newId
    );
    expect(c.id).toBe('c1');
    expect(c.levels[0].id).toBe('l1');
    expect(c.levels[1].id).not.toBe('bogus');
  });

  it('writes only the keys the security rules allow', () => {
    const doc = rubricDoc({
      id: 'r',
      title: 'T',
      description: undefined,
      criteria: [],
      createdAt: 1,
      updatedAt: 2,
      claudeEditedAt: 3,
    } as never);
    expect(Object.keys(doc).sort()).toEqual([
      'createdAt',
      'criteria',
      'id',
      'title',
      'updatedAt',
    ]);
    expect(
      rubricMaxPoints([
        { id: 'a', name: 'a', levels: [{ id: 'x', label: 'x', points: 4 }] },
        { id: 'b', name: 'b', levels: [{ id: 'y', label: 'y', points: 2 }] },
      ])
    ).toBe(6);
  });
});

describe('Activity Wall mirror', () => {
  it('writes the legacy fields and rejects a columns wall with no columns', () => {
    const wall = finalizeWall(
      { ...defaultWall('w', 1), layout: 'wordcloud', showNames: true },
      5
    );
    expect(wall).toMatchObject({
      mode: 'text',
      identificationMode: 'name',
      updatedAt: 5,
      createdAt: 1,
    });
    expect('classId' in wall).toBe(false);
    expect(() =>
      finalizeWall({ ...defaultWall('w', 1), layout: 'columns' }, 5)
    ).toThrow();
  });

  it('keeps section ids for unchanged labels so posts stay in place', () => {
    const out = toSections(
      ['Before', 'During', 'After'],
      [
        { id: 'a', label: 'After' },
        { id: 'b', label: 'Before' },
      ],
      newId
    );
    expect(out?.map((s) => s.id)).toEqual(['b', expect.any(String), 'a']);
    expect(toSections(undefined, [], newId)).toBeUndefined();
  });

  it('mirrors the session doc the widget writes', () => {
    const wall = finalizeWall(
      { ...defaultWall('w', 1), title: 'T', prompt: 'P', classIds: ['c1'] },
      5
    );
    expect(sessionMirror(wall, 'u', 7)).toMatchObject({
      id: 'u_w',
      activityId: 'w',
      teacherUid: 'u',
      title: 'T',
      layout: 'wall',
      driveVisibility: 'anyone',
      classId: 'c1',
      classIds: ['c1'],
      updatedAt: 7,
    });
  });
});

describe('mini-app limits', () => {
  it('rejects empty and oversized html', () => {
    expect(assertHtml('  <p>x</p> ')).toBe('<p>x</p>');
    expect(() => assertHtml('   ')).toThrow();
    expect(() => assertHtml('x'.repeat(200_000))).toThrow();
  });
});

describe('results summaries', () => {
  const key = [
    {
      id: 'q1',
      type: 'MC',
      text: 'Pick A',
      correctAnswer: 'A',
      incorrectAnswers: ['B', 'C'],
    },
    { id: 'q2', type: 'FIB', text: 'Say cat', correctAnswer: 'cat' },
  ];
  const response = (uid: string, a1: string, a2: string) => ({
    studentUid: uid,
    score: null,
    answers: [
      { questionId: 'q1', answer: a1 },
      { questionId: 'q2', answer: a2 },
    ],
  });

  it('reports percents and choice counts but never a typed answer', () => {
    const payload = computeAssessmentAggregate({
      assessmentId: 's',
      title: 'T',
      kind: 'quiz',
      groupQuestions: resolveGroupQuestions({ questions: key }, key),
      sessions: [
        {
          id: 's',
          teacherUid: 'u',
          teacherName: '',
          publicQuestions: key,
          scorePublishedAt: null,
          responses: [
            response('a', 'A', 'cat'),
            response('b', 'A', 'dog'),
            response('c', 'B', 'secret typed answer'),
            response('d', 'A', 'cat'),
            response('e', 'C', 'Cat'),
          ],
        },
      ],
    });
    const out = formatSummary(
      payload,
      new Map([
        ['q1', 'multiple_choice'],
        ['q2', 'fill_in_blank'],
      ])
    );
    expect(out.completed_responses).toBe(5);
    expect(out.questions[0]).toMatchObject({
      percent_correct: 60,
      choices: [
        { choice: 'A', picked: 3, correct: true },
        { choice: 'B', picked: 1, correct: false },
        { choice: 'C', picked: 1, correct: false },
      ],
    });
    expect(out.questions[1]).toMatchObject({ percent_correct: 60 });
    expect(JSON.stringify(out)).not.toContain('secret typed answer');
    expect(JSON.stringify(out)).not.toMatch(/"(a|b|c|d|e)"/);
  });

  it('suppresses small classes and maps video variants for the grader', () => {
    expect(suppressed(MIN_RESPONSES - 1)).toMatchObject({ suppressed: true });
    expect(videoKeyForGrader([{ id: 'q', acceptableVariants: ['x'] }])).toEqual(
      [{ id: 'q', acceptableVariants: ['x'], alternateAnswers: ['x'] }]
    );
  });

  it('scopes live video sessions to the asked questions', () => {
    const qs = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];
    const live = videoAskedScope({
      sessionMode: 'teacher',
      live: { askedQuestionIds: ['q1', 'q3'], skippedQuestionIds: ['q2'] },
    });
    expect(live.pacing).toBe('live');
    expect(live.keep(qs)).toEqual([{ id: 'q1' }, { id: 'q3' }]);
    const selfPaced = videoAskedScope({});
    expect(selfPaced.pacing).toBe('self_paced');
    expect(selfPaced.keep(qs)).toBe(qs);
  });
});
