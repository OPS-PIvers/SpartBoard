import { describe, expect, it } from 'vitest';
import type { Rubric } from '@/types';
import { applyRubricEdit, sameRubricContent } from './rubricPoints';

const rubric = (criterionIds: string[], top: number, id = 'lib-1'): Rubric => ({
  id,
  title: 'Essay',
  createdAt: 1,
  updatedAt: 1,
  criteria: criterionIds.map((cid) => ({
    id: cid,
    name: `Criterion ${cid}`,
    levels: [
      { id: `${cid}-l0`, label: 'Low', points: 0 },
      { id: `${cid}-l1`, label: 'High', points: top },
    ],
  })),
});

const main = rubric(['a', 'b'], 2);
const modified = rubric(['a-mod', 'b-mod'], 2);

describe('applyRubricEdit', () => {
  it('swaps a main-rubric edit in, updates points and names the library id', () => {
    const edited = rubric(['a', 'b'], 3);
    const out = applyRubricEdit(
      [{ rubricId: 'lib-1', rubricSnapshot: main, points: 4 }],
      edited
    );
    expect(out.changed).toBe(true);
    expect(out.questions[0].rubricSnapshot).toBe(edited);
    expect(out.questions[0].points).toBe(6);
    expect(out.libraryIds).toEqual(['lib-1']);
    expect(out.before).toBe(main);
    expect(out.requiredTotal).toBeUndefined();
  });

  it('never writes a modified copy back to the library', () => {
    const edited = { ...modified, title: 'Essay (support)' };
    const out = applyRubricEdit(
      [
        {
          rubricId: 'lib-1',
          rubricSnapshot: main,
          modifiedRubricId: 'lib-1',
          modifiedRubricSnapshot: modified,
          points: 4,
        },
      ],
      edited
    );
    expect(out.changed).toBe(true);
    expect(out.questions[0].modifiedRubricSnapshot).toBe(edited);
    expect(out.questions[0].rubricSnapshot).toBe(main);
    expect(out.questions[0].points).toBe(4);
    expect(out.libraryIds).toEqual([]);
    expect(out.before).toBe(modified);
  });

  it('flags a main edit whose total no longer matches the modified rubric', () => {
    const out = applyRubricEdit(
      [{ rubricSnapshot: main, modifiedRubricSnapshot: modified, points: 4 }],
      rubric(['a', 'b'], 3)
    );
    expect(out.requiredTotal).toBe(4);
  });

  it('flags a modified edit whose total no longer matches the main rubric', () => {
    const out = applyRubricEdit(
      [{ rubricSnapshot: main, modifiedRubricSnapshot: modified, points: 4 }],
      rubric(['a-mod', 'b-mod'], 1)
    );
    expect(out.requiredTotal).toBe(4);
  });

  it('allows a modified edit that keeps the total', () => {
    const out = applyRubricEdit(
      [{ rubricSnapshot: main, modifiedRubricSnapshot: modified, points: 4 }],
      {
        ...modified,
        criteria: [
          {
            ...modified.criteria[0],
            levels: [
              { id: 'x0', label: 'Low', points: 0 },
              { id: 'x1', label: 'High', points: 3 },
            ],
          },
          {
            ...modified.criteria[1],
            levels: [
              { id: 'y0', label: 'Low', points: 0 },
              { id: 'y1', label: 'High', points: 1 },
            ],
          },
        ],
      }
    );
    expect(out.requiredTotal).toBeUndefined();
    expect(out.changed).toBe(true);
  });

  it('leaves questions with another rubric untouched', () => {
    const q = { rubricId: 'lib-2', rubricSnapshot: rubric(['z'], 2, 'lib-2') };
    const out = applyRubricEdit([q], rubric(['a', 'b'], 3));
    expect(out.changed).toBe(false);
    expect(out.questions[0]).toBe(q);
    expect(out.libraryIds).toEqual([]);
  });
});

describe('sameRubricContent', () => {
  it('ignores timestamps but not points or text', () => {
    expect(sameRubricContent(main, { ...main, updatedAt: 99 })).toBe(true);
    expect(sameRubricContent(main, rubric(['a', 'b'], 3))).toBe(false);
    expect(sameRubricContent(main, { ...main, title: 'Other' })).toBe(false);
  });
});
