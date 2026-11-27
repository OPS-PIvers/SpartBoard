import { describe, expect, it, vi } from 'vitest';
import type { Rubric } from '@/types';
import {
  applyRubricEdit,
  RubricLibraryError,
  sameRubricContent,
  saveRubricThenRescore,
  updateLibraryRubrics,
} from './rubricPoints';

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

  it('compares the library against the main rubric, not a modified copy with the same criteria', () => {
    const renamedCopy: Rubric = {
      ...main,
      criteria: main.criteria.map((c) => ({
        ...c,
        name: `${c.name} (support)`,
      })),
    };
    const out = applyRubricEdit(
      [
        {
          rubricSnapshot: rubric(['z'], 2, 'lib-2'),
          modifiedRubricSnapshot: renamedCopy,
        },
        { rubricId: 'lib-1', rubricSnapshot: main, points: 4 },
      ],
      { ...main, title: 'Essay v2' }
    );
    expect(out.before).toBe(main);
  });

  it('lets a legacy question whose totals already differ be edited', () => {
    const legacyModified = rubric(['a-mod', 'b-mod'], 3);
    const q = {
      rubricSnapshot: main,
      modifiedRubricSnapshot: legacyModified,
      points: 4,
    };
    expect(
      applyRubricEdit([q], { ...main, title: 'Essay v2' }).requiredTotal
    ).toBeUndefined();
    expect(
      applyRubricEdit([q], rubric(['a', 'b'], 1)).requiredTotal
    ).toBeUndefined();
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

describe('saveRubricThenRescore', () => {
  it('still rescores when only the library write failed, then reports it', async () => {
    const rescore = vi.fn().mockResolvedValue(undefined);
    await expect(
      saveRubricThenRescore(
        () => Promise.reject(new RubricLibraryError('library')),
        rescore
      )
    ).rejects.toThrow('library');
    expect(rescore).toHaveBeenCalledTimes(1);
  });

  it('skips rescoring when the quiz itself did not save', async () => {
    const rescore = vi.fn().mockResolvedValue(undefined);
    await expect(
      saveRubricThenRescore(() => Promise.reject(new Error('quiz')), rescore)
    ).rejects.toThrow('quiz');
    expect(rescore).not.toHaveBeenCalled();
  });

  it('reports a rescore failure over the library one', async () => {
    await expect(
      saveRubricThenRescore(
        () => Promise.reject(new RubricLibraryError('library')),
        () => Promise.reject(new Error('scores'))
      )
    ).rejects.toThrow('scores');
  });
});

describe('updateLibraryRubrics', () => {
  const edited = { ...main, id: 'snap-1', title: 'Essay v2' };
  const libraryOf = (r: Rubric) => ({ ...r, id: 'lib-1' });

  it('writes the edit when the library still matches the quiz', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const out = await updateLibraryRubrics(['lib-1'], edited, main, {
      get: () => Promise.resolve(libraryOf(main)),
      save,
    });
    expect(out.kept).toBe(false);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lib-1', title: 'Essay v2' })
    );
  });

  it('keeps a library copy with newer edits', async () => {
    const save = vi.fn();
    const out = await updateLibraryRubrics(['lib-1'], edited, main, {
      get: () => Promise.resolve(libraryOf({ ...main, title: 'Mine' })),
      save,
    });
    expect(out.kept).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('turns a failed library write into a RubricLibraryError and still rescores', async () => {
    const rescore = vi.fn().mockResolvedValue(undefined);
    const failing = updateLibraryRubrics(
      ['lib-1'],
      { ...edited, id: 'snap-fail' },
      main,
      {
        get: () => Promise.resolve(libraryOf(main)),
        save: () => Promise.reject(new Error('offline')),
      }
    );
    await expect(failing).rejects.toBeInstanceOf(RubricLibraryError);
    await expect(
      saveRubricThenRescore(
        () =>
          updateLibraryRubrics(
            ['lib-1'],
            { ...edited, id: 'snap-fail2' },
            main,
            {
              get: () => Promise.resolve(libraryOf(main)),
              save: () => Promise.reject(new Error('offline')),
            }
          ).then(() => undefined),
        rescore
      )
    ).rejects.toBeInstanceOf(RubricLibraryError);
    expect(rescore).toHaveBeenCalledTimes(1);
  });

  it('still overwrites the old library copy on a retry, when the quiz already holds the edit', async () => {
    const retried = { ...edited, id: 'snap-retry' };
    const library = libraryOf(main);
    await expect(
      updateLibraryRubrics(['lib-1'], retried, main, {
        get: () => Promise.resolve(library),
        save: () => Promise.reject(new Error('offline')),
      })
    ).rejects.toBeInstanceOf(RubricLibraryError);
    const save = vi.fn().mockResolvedValue(undefined);
    const out = await updateLibraryRubrics(['lib-1'], retried, retried, {
      get: () => Promise.resolve(library),
      save,
    });
    expect(out.kept).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('treats a library copy that already equals the edit as up to date', async () => {
    const save = vi.fn();
    const out = await updateLibraryRubrics(['lib-1'], edited, edited, {
      get: () => Promise.resolve(libraryOf(edited)),
      save,
    });
    expect(out.kept).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
