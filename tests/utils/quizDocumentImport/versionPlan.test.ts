import { describe, expect, it } from 'vitest';
import type { QuizData } from '@/types';
import {
  NEW_GROUP,
  NO_GROUP,
  SHUFFLED_BEHAVIOR,
  assignVersion,
  buildVersionImport,
  findReorders,
  initialVersionPlan,
  isReorderOf,
  looksVersioned,
  planProblems,
  renameGroup,
  setGroupCreate,
  setGroupKind,
  unlinkImage,
  versionQuestions,
  withUploadedPictures,
} from '@/utils/quizDocumentImport/versionPlan';
import type { ExtractedQuestion } from '@/utils/quizDocumentImport/types';
import { resolveQuizAssignment } from '@/utils/questionBanks';
import { importedFrq, importedMc } from './versionFixtures';

const mc = (
  text: string,
  options: string[],
  answer: string
): ExtractedQuestion => ({
  number: 1,
  text,
  type: 'MC',
  options: options.map((t, i) => ({
    letter: String.fromCharCode(65 + i),
    text: t,
  })),
  correctAnswer: answer,
  imageIds: [],
  warnings: [],
});

describe('initialVersionPlan', () => {
  it('takes the AI grouping for the reference FRQ file', async () => {
    const plan = initialVersionPlan(await importedFrq());
    expect(
      plan.groups.map((g) => [g.kind, g.name, g.versions, g.create])
    ).toEqual([
      ['parallel', 'Unit 3 FRQ', [0, 1], true],
      ['retake', 'Unit 3 FRQ Retake', [2, 3], true],
      ['split', 'Unit 3 FRQ Split', [4, 5], true],
    ]);
  });

  it('turns reordered MC versions into one shuffled quiz (V9)', async () => {
    const set = await importedMc();
    expect(findReorders(set)).toEqual([{ version: 1, of: 0 }]);
    expect(initialVersionPlan(set).groups).toEqual([
      expect.objectContaining({ kind: 'duplicate', versions: [0, 1] }),
    ]);
  });

  it('names a retake the AI left unnamed as one', async () => {
    const set = await importedFrq();
    set.groups[1] = { ...set.groups[1], name: 'Unit 3 FRQ' };
    expect(initialVersionPlan(set).groups[1].name).toBe('Unit 3 FRQ Retake');
  });
});

describe('isReorderOf', () => {
  const a = [
    mc('Capital of France?', ['Paris', 'Rome'], 'A'),
    mc('2 + 2?', ['3', '4'], 'B'),
  ];

  it('compares content and each version’s own key, not position', () => {
    const b = [
      mc('2 + 2?', ['4', '3'], 'A'),
      mc('Capital of France?', ['Rome', 'Paris'], 'B'),
    ];
    expect(isReorderOf(a, b)).toBe(true);
  });

  it('keeps versions whose keys disagree apart', () => {
    const b = [
      mc('2 + 2?', ['4', '3'], 'B'),
      mc('Capital of France?', ['Rome', 'Paris'], 'B'),
    ];
    expect(isReorderOf(a, b)).toBe(false);
  });

  it('keeps versions with a different question apart', () => {
    const b = [
      mc('2 + 3?', ['4', '3'], 'A'),
      mc('Capital of France?', ['Rome', 'Paris'], 'B'),
    ];
    expect(isReorderOf(a, b)).toBe(false);
  });
});

describe('versionQuestions', () => {
  it('makes a written version one question holding its parts verbatim (V1)', async () => {
    const set = await importedFrq();
    const split = {
      ...set.versions[0],
      questions: [
        { ...set.versions[0].questions[0], text: 'Use the maps.' },
        { ...set.versions[0].questions[0], text: 'A. Identify the hearth.' },
      ],
    };
    const [only, ...rest] = versionQuestions(split, {});
    expect(rest).toEqual([]);
    expect(only.type).toBe('free-response');
    expect(only.text).toBe('Use the maps.\nA. Identify the hearth.');
  });

  it('points a version at the earlier picture it shares', async () => {
    const set = await importedFrq();
    const [q] = versionQuestions(set.versions[1], set.sharedImages);
    expect(q.stimulusIds).toEqual(set.versions[0].questions[0].imageIds);
  });
});

describe('editing the plan', () => {
  it('moves a version to a new quiz and back to the bank only', async () => {
    const set = await importedFrq();
    let plan = initialVersionPlan(set);
    plan = assignVersion(set, plan, 3, NEW_GROUP);
    expect(plan.groups.map((g) => g.versions)).toEqual([
      [0, 1],
      [2],
      [4, 5],
      [3],
    ]);
    expect(plan.groups[3]).toMatchObject({
      kind: 'parallel',
      name: 'Unit 3 REASSESSMENT',
    });
    plan = assignVersion(set, plan, 3, NO_GROUP);
    expect(plan.groups).toHaveLength(3);
  });

  it('turns a shuffled copy back into random versions once it stops being one', async () => {
    const set = await importedMc();
    let plan = initialVersionPlan(set);
    plan = assignVersion(set, plan, 1, NEW_GROUP);
    expect(plan.groups.map((g) => g.kind)).toEqual(['parallel', 'parallel']);
  });

  it('adds Retake to the name of a quiz switched to a retake', async () => {
    const set = await importedFrq();
    const plan = setGroupKind(set, initialVersionPlan(set), 'g1', 'retake');
    expect(plan.groups[0].name).toBe('Unit 3 FRQ Retake');
  });

  it('asks for a name on every quiz being created', async () => {
    const plan = renameGroup(
      initialVersionPlan(await importedFrq()),
      'g1',
      ' '
    );
    expect(planProblems(plan)).toEqual(['Give every quiz a name.']);
    expect(planProblems(setGroupCreate(plan, 'g1', false))).toEqual([]);
  });
});

describe('buildVersionImport', () => {
  it('puts every version in one bank and makes one quiz a group (V6, V8)', async () => {
    const set = await importedFrq();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'Bohl Unit 3 FRQ (2025)',
      now: 5,
    });
    expect(build.folderTitle).toBe('Bohl Unit 3 FRQ (2025)');
    expect(build.bank?.title).toBe('Bohl Unit 3 FRQ (2025)');
    const bankIds = build.bank?.questions.map((q) => q.id) ?? [];
    expect(bankIds).toHaveLength(6);
    expect(build.bank?.questions.every((q) => q.type === 'free-response')).toBe(
      true
    );

    const [parallel, retake, split] = build.quizzes;
    expect(parallel.quiz.title).toBe('Unit 3 FRQ');
    expect(parallel.quiz.questions).toEqual([]);
    expect(parallel.quiz.bankSlots).toEqual([
      expect.objectContaining({
        bankId: build.bank?.id,
        mode: 'random',
        dealing: 'balanced',
        count: 1,
        questionIds: [bankIds[0], bankIds[1]],
      }),
    ]);
    expect(parallel.quiz.order).toEqual([
      { kind: 'slot', id: parallel.quiz.bankSlots?.[0].id },
    ]);
    expect(retake.quiz.title).toBe('Unit 3 FRQ Retake');
    expect(retake.quiz.bankSlots?.[0].questionIds).toEqual([
      bankIds[2],
      bankIds[3],
    ]);

    // V10: two written questions in two sections, and no Stop between them.
    expect(split.quiz.sections?.map((s) => s.title)).toEqual([
      'Version Split Pt 1',
      'Version Split Pt 2',
    ]);
    expect(split.quiz.questions).toHaveLength(2);
    expect(split.quiz.order?.map((e) => e.kind)).toEqual([
      'section',
      'question',
      'section',
      'question',
    ]);
    expect(split.quiz.questions[0].text).toContain('A. Identify the hearth');
    expect(bankIds).not.toContain(split.quiz.questions[0].id);
    expect(build.quizzes.every((p) => !p.shuffle)).toBe(true);
  });

  it('deals each quiz evenly over only its own versions (V18)', async () => {
    const set = await importedFrq();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'F',
    });
    const bank = build.bank;
    if (!bank) throw new Error('no bank');
    const banks = new Map([[bank.id, bank]]);
    const [parallel, retake] = build.quizzes;
    for (const planned of [parallel, retake]) {
      const [slot] = resolveQuizAssignment(planned.quiz, banks).sessionSlots;
      expect(slot.dealing).toBe('balanced');
      expect(slot.poolQuestionIds).toEqual(
        planned.quiz.bankSlots?.[0].questionIds
      );
    }
  });

  it('leaves out a quiz the teacher unticked and uses the new name', async () => {
    const set = await importedFrq();
    let plan = setGroupCreate(initialVersionPlan(set), 'g2', false);
    plan = renameGroup(plan, 'g1', 'Religion FRQ');
    const build = buildVersionImport(set, plan, { folderTitle: 'F' });
    expect(build.quizzes.map((p) => p.quiz.title)).toEqual([
      'Religion FRQ',
      'Unit 3 FRQ Split',
    ]);
    expect(build.bank?.questions).toHaveLength(6);
  });

  it('makes reordered MC versions one shuffled quiz with no bank (V9)', async () => {
    const set = await importedMc();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'Unit 3 Quiz',
    });
    expect(build.bank).toBeNull();
    expect(build.quizzes).toHaveLength(1);
    expect(build.quizzes[0].shuffle).toBe(true);
    expect(build.quizzes[0].quiz.questions.map((q) => q.correctAnswer)).toEqual(
      [
        'Buddhism',
        'people move and carry an idea',
        'a language used between speakers of different languages',
        'the blending of two cultures',
      ]
    );
    expect(SHUFFLED_BEHAVIOR.sessionOptions.shuffleQuestions).toBe(true);
  });

  it('keeps an unticked shuffled quiz’s versions in the bank', async () => {
    const set = await importedMc();
    const plan = setGroupCreate(initialVersionPlan(set), 'g1', false);
    const build = buildVersionImport(set, plan, { folderTitle: 'Q' });
    expect(build.quizzes).toHaveLength(0);
    expect(build.bank?.questions.length).toBeGreaterThan(0);
  });

  it('gives whole MC tests that differ a quiz each, since one slot deals one question', async () => {
    const set = await importedMc();
    const plan = setGroupKind(set, initialVersionPlan(set), 'g1', 'parallel');
    const build = buildVersionImport(set, plan, { folderTitle: 'Q' });
    expect(build.bank?.questions).toHaveLength(8);
    expect(build.quizzes.map((p) => p.quiz.title)).toEqual([
      'Unit 3 Quiz (Version A)',
      'Unit 3 Quiz (Version B)',
    ]);
  });

  it('uploads each shared picture once and gives every item only its own', async () => {
    const set = await importedFrq();
    const [b1] = set.versions[1].questions[0].imageIds;
    const plan = unlinkImage(initialVersionPlan(set), b1);
    const build = buildVersionImport(set, plan, { folderTitle: 'F' });
    const uploads: string[] = [];
    const ready = await withUploadedPictures(build, (all: QuizData) => {
      const ids = [
        ...new Set(all.questions.flatMap((q) => q.stimulusIds ?? [])),
      ];
      uploads.push(...ids);
      return Promise.resolve({
        ...all,
        stimuli: ids.map((id) => ({
          id: `s-${id}`,
          type: 'image' as const,
          url: `https://drive/${id}`,
          label: id,
        })),
        questions: all.questions.map((q) => ({
          ...q,
          ...(q.stimulusIds
            ? { stimulusIds: q.stimulusIds.map((id) => `s-${id}`) }
            : {}),
        })),
      });
    });
    // A's two maps, plus B's unlinked first map.
    expect(uploads.sort()).toEqual(
      [...set.versions[0].questions[0].imageIds, b1].sort()
    );
    expect(ready.bank?.stimuli).toHaveLength(3);
    const split = ready.quizzes[2].quiz;
    expect(split.stimuli?.map((s) => s.id).sort()).toEqual(
      set.versions[0].questions[0].imageIds.map((id) => `s-${id}`).sort()
    );
    expect(ready.quizzes[0].quiz.stimuli).toBeUndefined();
  });
});

describe('looksVersioned', () => {
  it('needs two different version marks', () => {
    expect(looksVersioned(['Version A', 'Use the map.', 'Version B'])).toBe(
      true
    );
    expect(looksVersioned(['Name the version A of the law.'])).toBe(false);
  });
});
