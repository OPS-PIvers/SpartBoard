import { describe, expect, it } from 'vitest';
import type {
  QuizStimulus,
  Rubric,
  WritingAssignmentDefinition,
} from '@/types';
import {
  MAX_WRITING_STIMULI,
  UNTITLED_WRITING_ASSIGNMENT,
  duplicateWritingAssignment,
  newWritingAssignment,
  normalizeWritingAssignment,
  writingGradingLabel,
} from './writingAssignments';

const RUBRIC: Rubric = {
  id: 'rub-1',
  title: 'Essay rubric',
  criteria: [],
  createdAt: 1,
  updatedAt: 1,
};

const passage = (id: string): QuizStimulus => ({
  id,
  type: 'text',
  url: '',
  text: 'A passage.',
  label: 'Passage',
});

const assignment = (
  overrides: Partial<WritingAssignmentDefinition> = {}
): WritingAssignmentDefinition => ({
  id: 'wa-1',
  title: 'Argument essay',
  prompt: 'Is homework worth it?',
  stimuli: [passage('s-1')],
  grading: { mode: 'points', points: 20 },
  folderId: 'folder-1',
  order: 2,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('normalizeWritingAssignment', () => {
  it('trims the title, falls back when blank and stamps updatedAt', () => {
    expect(
      normalizeWritingAssignment(assignment({ title: '  Essay  ' }), 50)
    ).toMatchObject({ title: 'Essay', updatedAt: 50, createdAt: 1 });
    expect(
      normalizeWritingAssignment(assignment({ title: '   ' }), 50).title
    ).toBe(UNTITLED_WRITING_ASSIGNMENT);
  });

  it('caps Stimulus tabs at the rules limit', () => {
    const stimuli = Array.from({ length: MAX_WRITING_STIMULI + 3 }, (_, i) =>
      passage(`s-${i}`)
    );
    expect(
      normalizeWritingAssignment(assignment({ stimuli }), 1).stimuli
    ).toHaveLength(MAX_WRITING_STIMULI);
  });

  it('keeps valid word limits, drops a backwards max and a lone enforce', () => {
    expect(
      normalizeWritingAssignment(
        assignment({ minWords: 200, maxWords: 600, enforceWordLimit: true }),
        1
      )
    ).toMatchObject({ minWords: 200, maxWords: 600, enforceWordLimit: true });
    const backwards = normalizeWritingAssignment(
      assignment({ minWords: 600, maxWords: 200 }),
      1
    );
    expect(backwards.minWords).toBe(600);
    expect(backwards).not.toHaveProperty('maxWords');
    expect(
      normalizeWritingAssignment(assignment({ enforceWordLimit: true }), 1)
    ).not.toHaveProperty('enforceWordLimit');
  });

  it('clamps points and falls back to ungraded for a rubric with no snapshot', () => {
    expect(
      normalizeWritingAssignment(
        assignment({ grading: { mode: 'points', points: 7.6 } }),
        1
      ).grading
    ).toEqual({ mode: 'points', points: 8 });
    expect(
      normalizeWritingAssignment(
        assignment({ grading: { mode: 'points', points: 0 } }),
        1
      ).grading
    ).toEqual({ mode: 'points', points: 1 });
    expect(
      normalizeWritingAssignment(
        assignment({
          grading: {
            mode: 'rubric',
            rubricId: 'rub-1',
            rubricSnapshot: undefined as unknown as Rubric,
          },
        }),
        1
      ).grading
    ).toEqual({ mode: 'ungraded' });
  });

  it('writes no undefined keys and keeps order and folder', () => {
    const out = normalizeWritingAssignment(
      assignment({ folderId: undefined }),
      1
    );
    expect(Object.values(out)).not.toContain(undefined);
    expect(out.folderId).toBeNull();
    expect(out.order).toBe(2);
  });
});

describe('duplicateWritingAssignment', () => {
  it('copies with a new id, a copy title, fresh stimulus ids and no order', () => {
    let n = 0;
    const copy = duplicateWritingAssignment(
      assignment({
        archivedAt: 9,
        grading: { mode: 'rubric', rubricId: 'rub-1', rubricSnapshot: RUBRIC },
      }),
      () => `new-${++n}`,
      100
    );
    expect(copy.id).toBe('new-1');
    expect(copy.title).not.toBe('Argument essay');
    expect(copy.title).toContain('Argument essay');
    expect(copy.stimuli?.[0].id).toBe('new-2');
    expect(copy.stimuli?.[0].text).toBe('A passage.');
    expect(copy).not.toHaveProperty('order');
    expect(copy).toMatchObject({
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
      folderId: 'folder-1',
      grading: { mode: 'rubric', rubricId: 'rub-1', rubricSnapshot: RUBRIC },
    });
  });
});

describe('newWritingAssignment and writingGradingLabel', () => {
  it('starts ungraded in the open folder', () => {
    expect(newWritingAssignment('id-1', 'New', 'f-1', 5)).toEqual({
      id: 'id-1',
      title: 'New',
      prompt: '',
      stimuli: [],
      grading: { mode: 'ungraded' },
      folderId: 'f-1',
      createdAt: 5,
      updatedAt: 5,
    });
  });

  it('labels each grading mode', () => {
    expect(writingGradingLabel({ mode: 'ungraded' })).toBe('Ungraded');
    expect(writingGradingLabel({ mode: 'points', points: 1 })).toBe('1 point');
    expect(writingGradingLabel({ mode: 'points', points: 20 })).toBe(
      '20 points'
    );
    expect(
      writingGradingLabel({
        mode: 'rubric',
        rubricId: 'rub-1',
        rubricSnapshot: RUBRIC,
      })
    ).toBe('Essay rubric');
  });
});
