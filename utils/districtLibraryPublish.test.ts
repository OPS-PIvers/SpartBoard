import { describe, expect, it } from 'vitest';
import {
  asQuizQuestion,
  bankFromPackage,
  checkPackageUpload,
  diffQuestionIds,
  draftHeaderFor,
  hasNestedArray,
  packageFieldsFor,
  pictureFolderFor,
  pictureStoragePath,
  pruneTranslations,
  planPackageUpload,
  publishOrder,
  questionNotesFrom,
  quizFromPackage,
  syncedQuizDocFor,
} from './districtLibraryPublish';
import type {
  DistrictPackageEntry,
  DistrictPackageManifest,
} from './districtLibraryPackage';
import type { DistrictLibraryItem } from '@/types/districtLibrary';

const bankEntry: DistrictPackageEntry = {
  kind: 'questionBank',
  id: 'bank-1',
  title: 'Phenomenon 1',
  path: 'banks/p1.bank.json',
  questionCount: 1,
  pictures: ['pictures/tab-a.png', 'pictures/chart-1.png'],
  questions: [
    {
      id: 'q1',
      attribution: 'Minnesota Department of Education, released MCA item 1',
      resultsPicture: 'pictures/chart-1.png',
    },
  ],
};
const quizEntry: DistrictPackageEntry = {
  kind: 'quiz',
  id: 'quiz-1',
  title: 'Practice test',
  path: 'quizzes/practice.quiz.json',
  questionCount: 2,
  pictures: [],
};
const manifest: DistrictPackageManifest = {
  format: 'spartboard-package',
  version: 1,
  title: 'MCA IV science grade 8',
  generatedAt: 100,
  source: { name: 'Minnesota Department of Education' },
  entries: [quizEntry, bankEntry],
};
const urls = new Map([
  ['pictures/tab-a.png', 'https://storage/v1/tab-a.png'],
  ['pictures/chart-1.png', 'https://storage/v1/chart-1.png'],
]);

const bankFile = {
  id: 'bank-1',
  title: 'Phenomenon 1',
  stimuli: [
    { id: 's1', type: 'image', url: 'pictures/tab-a.png', tabLabel: 'Tab A' },
  ],
  questions: [
    {
      id: 'q1',
      type: 'FIB',
      text: 'Heat moves from {{blank}} to cold.',
      correctAnswer: 'hot',
      blankType: 'dropdown',
      blankChoices: [{ choices: ['hot', 'cold'] }],
      explanation: 'Energy flows from hot to cold.',
      dok: 2,
      stimulusIds: ['s1'],
    },
  ],
  language: 'en-US',
  createdAt: 5,
};

describe('publishOrder and planPackageUpload', () => {
  it('puts banks before quizzes', () => {
    expect(publishOrder(manifest.entries).map((e) => e.id)).toEqual([
      'bank-1',
      'quiz-1',
    ]);
  });

  it('marks entries already in the library as updates', () => {
    const existing = new Map([
      [
        'bank-1',
        { status: 'published', contentVersion: 1 } as DistrictLibraryItem,
      ],
    ]);
    expect(
      planPackageUpload(manifest.entries, existing).map((p) => [
        p.entry.id,
        p.action,
      ])
    ).toEqual([
      ['bank-1', 'update'],
      ['quiz-1', 'add'],
    ]);
  });
});

describe('pictureStoragePath', () => {
  it('gives every upload attempt its own folder so a retry never overwrites live pictures', () => {
    expect(
      pictureStoragePath(
        'bank-1',
        pictureFolderFor(1, 'a1b2'),
        'pictures/tab-a.png'
      )
    ).toBe('district_library/bank-1/v1-a1b2/tab-a.png');
    expect(pictureFolderFor(1, 'a1b2')).not.toBe(pictureFolderFor(1, 'c3d4'));
  });
});

describe('upload checks', () => {
  it('finds arrays inside arrays anywhere', () => {
    expect(hasNestedArray({ a: [1, { b: [2] }] })).toBe(false);
    expect(hasNestedArray({ a: [[1]] })).toBe(true);
    expect(hasNestedArray({ q: [{ choices: [['x']] }] })).toBe(true);
  });

  it('lists questions a replace removes and adds', () => {
    expect(diffQuestionIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
      removed: ['a'],
      added: ['d'],
    });
  });

  it('drops removed questions from translations and empty locales', () => {
    const t = {
      es: {
        locale: 'es',
        title: 'T',
        questions: { a: { text: 'A' }, b: { text: 'B' } },
        sourceHashes: { a: '1', b: '2' },
        reviewedQuestionIds: ['a', 'b'],
        model: 'm',
        generatedAt: 1,
        updatedAt: 1,
      },
      fr: {
        locale: 'fr',
        title: 'T',
        questions: { a: { text: 'A' } },
        sourceHashes: { a: '1' },
        reviewedQuestionIds: ['a'],
        model: 'm',
        generatedAt: 1,
        updatedAt: 1,
      },
    } as unknown as Parameters<typeof pruneTranslations>[0];
    const out = pruneTranslations(t, ['a']);
    expect(Object.keys(out ?? {})).toEqual(['es']);
    expect(Object.keys(out?.es.questions ?? {})).toEqual(['b']);
    expect(out?.es.reviewedQuestionIds).toEqual(['b']);
    expect(out?.es.sourceHashes).toEqual({ b: '2' });
  });

  it('refuses a kind change, a missing bank and a list inside a list before any write', () => {
    const files = {
      'bank-1': bankFile,
      'quiz-1': {
        id: 'quiz-1',
        title: 'Practice test',
        questions: [],
        bankSlots: [
          { id: 's', bankId: 'bank-1', mode: 'random' as const, count: 1 },
        ],
      },
    };
    expect(checkPackageUpload(manifest, files, new Map())).toEqual([]);
    const kindChanged = checkPackageUpload(
      manifest,
      files,
      new Map([['bank-1', { kind: 'quiz' } as DistrictLibraryItem]])
    );
    expect(kindChanged.map((p) => p.id)).toEqual(['bank-1']);
    const quizOnly = checkPackageUpload(
      manifest,
      files,
      new Map(),
      new Set(['quiz-1'])
    );
    expect(quizOnly.map((p) => p.id)).toEqual(['quiz-1']);
    const nested = checkPackageUpload(
      manifest,
      {
        ...files,
        'bank-1': {
          ...bankFile,
          questions: [{ ...bankFile.questions[0], grid: [['a']] }],
        },
      },
      new Map()
    );
    expect(nested.map((p) => p.id)).toEqual(['bank-1']);
  });
});

describe('bankFromPackage', () => {
  it('points pictures at uploaded URLs and keeps every question field', () => {
    const bank = bankFromPackage(bankFile, urls, 50);
    expect(bank.stimuli?.[0].url).toBe('https://storage/v1/tab-a.png');
    expect(bank.stimuli?.[0].label).toBe('');
    const q = bank.questions[0] as unknown as Record<string, unknown>;
    expect(q.blankType).toBe('dropdown');
    expect(q.blankChoices).toEqual([{ choices: ['hot', 'cold'] }]);
    expect(q.explanation).toBe('Energy flows from hot to cold.');
    expect(q.dok).toBe(2);
    expect(q.timeLimit).toBe(0);
    expect(q.incorrectAnswers).toEqual([]);
    expect(q.districtItemId).toBe('bank-1');
    expect(bank.createdAt).toBe(5);
    expect(bank.updatedAt).toBe(50);
  });
});

describe('asQuizQuestion', () => {
  it('fills only missing required fields', () => {
    expect(
      asQuizQuestion({
        id: 'q',
        type: 'MC',
        text: 't',
        correctAnswer: 'A',
        incorrectAnswers: ['B'],
        timeLimit: 30,
      })
    ).toMatchObject({
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
      timeLimit: 30,
    });
  });
});

describe('quizFromPackage', () => {
  it('pins random slots to the published library bank', () => {
    const quiz = quizFromPackage(
      {
        id: 'quiz-1',
        title: 'Practice test',
        questions: [],
        bankSlots: [
          { id: 'slot-1', bankId: 'bank-1', mode: 'random', count: 2 },
        ],
      },
      new Map(),
      new Map([
        [
          'bank-1',
          {
            itemId: 'bank-1',
            syncGroupId: 'group-b1',
            ownerUid: 'admin-uid',
            title: 'Phenomenon 1',
          },
        ],
      ]),
      10
    );
    expect(quiz.bankSlots).toEqual([
      {
        id: 'slot-1',
        bankId: 'bank-1',
        syncGroupId: 'group-b1',
        syncOwnerUid: 'admin-uid',
        bankTitle: 'Phenomenon 1',
        mode: 'random',
        count: 2,
        districtItemId: 'bank-1',
      },
    ]);
  });

  it('refuses a slot whose bank was not published', () => {
    expect(() =>
      quizFromPackage(
        {
          id: 'quiz-1',
          title: 'Practice test',
          questions: [],
          bankSlots: [{ id: 's', bankId: 'missing', mode: 'random', count: 1 }],
        },
        new Map(),
        new Map(),
        10
      )
    ).toThrow();
  });
});

describe('questionNotesFrom', () => {
  it('keeps attribution and the uploaded results picture per question', () => {
    expect(questionNotesFrom(bankEntry, urls)).toEqual({
      q1: {
        attribution: 'Minnesota Department of Education, released MCA item 1',
        resultsPictureUrl: 'https://storage/v1/chart-1.png',
      },
    });
    expect(questionNotesFrom(quizEntry, urls)).toBeUndefined();
  });
});

describe('draftHeaderFor and packageFieldsFor', () => {
  it('a new item starts as a draft that reaches nobody, holding the canonical id it was given', () => {
    expect(
      draftHeaderFor(bankEntry, {
        syncGroupId: 'rand-1',
        uid: 'admin-1',
        now: 5,
      })
    ).toMatchObject({
      id: 'bank-1',
      kind: 'bank',
      status: 'draft',
      everyone: false,
      targetBuildings: [],
      targetEmails: [],
      syncGroupId: 'rand-1',
      contentVersion: 0,
      createdAt: 5,
    });
  });

  it('an upload writes only package fields, never status, targeting, syncGroupId or createdAt', () => {
    const fields = packageFieldsFor(bankEntry, manifest, {
      contentVersion: 4,
      questionCount: 1,
      uid: 'admin-2',
      now: 200,
    });
    expect(fields).toMatchObject({
      title: 'Phenomenon 1',
      contentVersion: 4,
      sourceName: 'Minnesota Department of Education',
      packageGeneratedAt: 100,
      updatedBy: 'admin-2',
    });
    for (const key of [
      'status',
      'everyone',
      'targetBuildings',
      'targetGrades',
      'targetEmails',
      'gradeBuildings',
      'syncGroupId',
      'createdAt',
      'kind',
    ]) {
      expect(fields).not.toHaveProperty(key);
    }
  });
});

describe('syncedQuizDocFor', () => {
  it('carries the district mark and the next version', () => {
    const doc = syncedQuizDocFor(
      {
        id: 'quiz-1',
        title: 'Practice test',
        questions: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        groupId: 'group-q1',
        itemId: 'quiz-1',
        version: 2,
        uid: 'admin',
        participants: { admin: { joinedAt: 1 } },
        createdAt: 1,
        now: 9,
      }
    );
    expect(doc).toEqual({
      id: 'group-q1',
      version: 2,
      title: 'Practice test',
      questions: [],
      participants: { admin: { joinedAt: 1 } },
      createdAt: 1,
      updatedAt: 9,
      updatedBy: 'admin',
      districtItemId: 'quiz-1',
    });
  });
});
