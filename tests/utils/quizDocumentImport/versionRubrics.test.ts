import { describe, expect, it } from 'vitest';
import {
  NO_GROUP,
  assignVersion,
  buildVersionImport,
  initialVersionPlan,
  planPairing,
  setVersionRubric,
} from '@/utils/quizDocumentImport/versionPlan';
import { importedFrq, importedMc } from './versionFixtures';

const guides = { rubrics: { scoringGuides: true } };

describe('version rubrics', () => {
  it('pairs rubrics by order with the split counted once', async () => {
    const set = await importedFrq();
    const pairing = planPairing(set, initialVersionPlan(set));
    expect(pairing.units.map((u) => u.versions)).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4, 5],
    ]);
    expect(pairing.rubricFor).toEqual([0, 1, 2, 3, 4]);
    expect(pairing.countMismatch).toBeNull();
  });

  it('saves one library rubric per pair and attaches it to each version', async () => {
    const set = await importedFrq();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'Unit 3 FRQ',
      ...guides,
    });
    expect(build.rubrics.map((r) => r.title)).toEqual([
      'Unit 3 FRQ – Version A',
      'Unit 3 FRQ – Version B',
      'Unit 3 FRQ – Unit 3 Version C',
      'Unit 3 FRQ – Unit 3 REASSESSMENT',
      'Unit 3 FRQ – Unit 3 FRQ Split',
    ]);
    const bank = build.bank?.questions ?? [];
    expect(bank).toHaveLength(6);
    expect(bank[0].rubricId).toBe(build.rubrics[0].id);
    expect(bank[0].rubricSnapshot?.criteria).toHaveLength(6);
    expect(bank[0].points).toBe(10);
    expect(
      bank[2].rubricSnapshot?.criteria.map((c) => c.levels.length)
    ).toEqual([2, 3, 3, 2, 3, 3]);
    const slot = build.quizzes[0].quiz.bankSlots?.[0];
    expect(slot?.points).toBe(10);
  });

  it('gives each split part its slice of the one rubric', async () => {
    const set = await importedFrq();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'F',
      ...guides,
    });
    const split = build.quizzes.find((p) => p.quiz.sections?.length === 2);
    const [pt1, pt2] = split?.quiz.questions ?? [];
    const library = build.rubrics[4];
    expect(pt1.rubricId).toBe(library.id);
    expect(pt2.rubricId).toBe(library.id);
    expect(pt1.rubricSnapshot?.criteria.map((c) => c.name)).toEqual([
      'A. Part A',
      'B. Part B',
      'C. Part C',
    ]);
    expect(pt2.rubricSnapshot?.criteria.map((c) => c.name)).toEqual([
      'D. Part D',
      'E. Part E',
      'F. Part F',
    ]);
    expect((pt1.points ?? 0) + (pt2.points ?? 0)).toBe(10);
  });

  it('follows the teacher reassigning or clearing a rubric', async () => {
    const set = await importedFrq();
    let plan = setVersionRubric(initialVersionPlan(set), 0, 1);
    plan = setVersionRubric(plan, 1, null);
    expect(planPairing(set, plan).rubricFor.slice(0, 2)).toEqual([1, null]);
    const build = buildVersionImport(set, plan, {
      folderTitle: 'F',
      ...guides,
    });
    const bank = build.bank?.questions ?? [];
    expect(bank[0].rubricSnapshot?.title).toBe('F – Version A');
    expect(bank[0].rubricSnapshot?.criteria[0].levels).toHaveLength(2);
    expect(bank[1].rubricId).toBeUndefined();
    expect(build.rubrics).toHaveLength(4);
  });

  it('pairs each part alone once the split is broken up', async () => {
    const set = await importedFrq();
    const plan = assignVersion(set, initialVersionPlan(set), 5, NO_GROUP);
    const pairing = planPairing(set, plan);
    expect(pairing.units.map((u) => u.versions)).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4],
      [5],
    ]);
    expect(pairing.rubricFor).toEqual([0, 1, 2, 3, 4, null]);
    expect(pairing.countMismatch).toEqual({ versions: 6, rubrics: 5 });
  });

  it('imports no rubrics when it is not asked to', async () => {
    const set = await importedFrq();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'F',
    });
    expect(build.rubrics).toEqual([]);
    expect(build.bank?.questions[0].rubricId).toBeUndefined();
  });

  it('leaves a test without rubrics alone', async () => {
    const set = await importedMc();
    const build = buildVersionImport(set, initialVersionPlan(set), {
      folderTitle: 'Q',
      ...guides,
    });
    expect(build.rubrics).toEqual([]);
  });
});

describe('version rubrics without a written question', () => {
  it('saves no rubric that no question carries', async () => {
    const set = await importedMc();
    const withRubric = {
      ...set,
      rubrics: [
        {
          label: 'Rubric 1',
          title: 'Rubric 1',
          criteria: [
            { letter: 'A', prompt: 'Part A', points: 2, credit: [], notes: [] },
          ],
          warnings: [],
        },
      ],
    };
    const build = buildVersionImport(
      withRubric,
      initialVersionPlan(withRubric),
      {
        folderTitle: 'Q',
        ...guides,
      }
    );
    expect(build.rubrics).toEqual([]);
  });
});
