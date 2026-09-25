import { describe, expect, it } from 'vitest';
import type { ProjectGroup, ProjectStep } from '@/types';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';
import {
  approvalStepIdsFrom,
  classNamesForEntries,
  completedStepCount,
  defaultGroupColor,
  groupsForClass,
  makeWorkLink,
  nextGroupColor,
  normalizeWorkLinkUrl,
  parseStepLines,
  projectClassIdFor,
  rosterHasStudentSignIn,
  sortGroupsForBoard,
  stepLinesFrom,
  studentStateOptions,
} from './projectSteps';

const group = (overrides: Partial<ProjectGroup> = {}): ProjectGroup => ({
  id: 'g1',
  name: 'Group 1',
  classId: 'class-a',
  memberUids: [],
  order: 0,
  stepStates: {},
  workLinks: [],
  updatedAt: 0,
  ...overrides,
});

describe('parseStepLines', () => {
  it('turns pasted lines into steps, skipping blanks', () => {
    const steps = parseStepLines('Research\n\n  Draft  \nPresent');
    expect(steps.map((s) => s.title)).toEqual(['Research', 'Draft', 'Present']);
  });

  it('keeps the id of a line whose text is unchanged', () => {
    const first = parseStepLines('Research\nDraft');
    const second = parseStepLines('Research\nDraft\nPresent', first);
    expect(second[0].id).toBe(first[0].id);
    expect(second[1].id).toBe(first[1].id);
    expect(second[2].id).not.toBe(first[1].id);
  });

  it('keeps per-step settings when a step survives a re-paste', () => {
    const authored: ProjectStep[] = [
      { id: 'step-1', title: 'Research' },
      { id: 'step-2', title: 'Draft', requiresApproval: true },
    ];
    const reparsed = parseStepLines('Research\nDraft', authored);
    expect(reparsed[1]).toEqual(authored[1]);
  });

  it('round-trips through the textarea', () => {
    const steps = parseStepLines('Research\nDraft');
    expect(stepLinesFrom(steps)).toBe('Research\nDraft');
  });

  it('caps at the step ceiling', () => {
    const steps = parseStepLines(
      Array.from({ length: 50 }, (_, i) => `Step ${i}`).join('\n')
    );
    expect(steps).toHaveLength(32);
  });
});

describe('approvalStepIdsFrom', () => {
  it('lists only the steps that gate', () => {
    expect(
      approvalStepIdsFrom([
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', requiresApproval: true },
      ])
    ).toEqual(['b']);
  });
});

describe('studentStateOptions', () => {
  it('stops a student at readyForReview on an approval step', () => {
    expect(
      studentStateOptions({ id: 'b', title: 'B', requiresApproval: true })
    ).toEqual(['notStarted', 'inProgress', 'readyForReview']);
  });

  it('lets a student finish a self-serve step', () => {
    expect(studentStateOptions({ id: 'a', title: 'A' })).toContain('done');
  });
});

describe('completedStepCount', () => {
  it('counts only done steps and ignores an unknown step id', () => {
    const steps: ProjectStep[] = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    const g = group({
      stepStates: { a: 'done', b: 'readyForReview', c: 'done' },
    });
    expect(completedStepCount(g, steps)).toBe(1);
  });
});

describe('sortGroupsForBoard', () => {
  it('keeps the teacher order, then sorts ties by name', () => {
    const sorted = sortGroupsForBoard([
      group({ id: 'c', name: 'C', order: 2 }),
      group({ id: 'b', name: 'B', order: 0 }),
      group({ id: 'a', name: 'A', order: 0 }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('defaultGroupColor', () => {
  it('deals palette colors by order and wraps around', () => {
    expect(defaultGroupColor(0)).toBe(SCOREBOARD_COLORS[0]);
    expect(defaultGroupColor(SCOREBOARD_COLORS.length)).toBe(
      SCOREBOARD_COLORS[0]
    );
    expect(nextGroupColor(SCOREBOARD_COLORS[0])).toBe(SCOREBOARD_COLORS[1]);
    expect(nextGroupColor(undefined)).toBe(SCOREBOARD_COLORS[0]);
  });
});

describe('classNamesForEntries', () => {
  it('names only the classes the import touches', () => {
    expect(
      classNamesForEntries(
        [{ classId: 'sec-1' }],
        [
          { id: 'r1', name: 'Period 1', classlinkClassId: 'sec-1' },
          { id: 'r2', name: 'Period 2', classlinkClassId: 'sec-2' },
        ]
      )
    ).toEqual({ 'sec-1': 'Period 1' });
  });
});

describe('rosterHasStudentSignIn', () => {
  const student = (overrides: Record<string, string> = {}) => ({
    ...overrides,
  });
  it('is false for a hand-built roster', () => {
    expect(rosterHasStudentSignIn({ id: 'r1', students: [student()] })).toBe(
      false
    );
  });
  it('is false for a linked roster whose students have no sign-in', () => {
    expect(
      rosterHasStudentSignIn({
        id: 'r1',
        classlinkClassId: 'sec-1',
        students: [student()],
      })
    ).toBe(false);
  });
  it('is true once a student can sign in', () => {
    expect(
      rosterHasStudentSignIn({
        id: 'r1',
        classlinkClassId: 'sec-1',
        students: [student({ classLinkSourcedId: 'SID-1' })],
      })
    ).toBe(true);
    expect(
      rosterHasStudentSignIn({
        id: 'r1',
        testClassId: 'mock-class',
        students: [student({ email: 'kid@school.org' })],
      })
    ).toBe(true);
  });
});

describe('groupsForClass', () => {
  it('shows only the active class and nothing at all without one', () => {
    const groups = [
      group({ id: 'a', classId: 'class-a' }),
      group({ id: 'b', classId: 'class-b' }),
    ];
    expect(groupsForClass(groups, 'class-a').map((g) => g.id)).toEqual(['a']);
    expect(groupsForClass(groups, null)).toEqual([]);
  });
});

describe('normalizeWorkLinkUrl', () => {
  it('adds a scheme to a bare host', () => {
    expect(normalizeWorkLinkUrl('docs.google.com/d/1')).toBe(
      'https://docs.google.com/d/1'
    );
  });

  it('rejects a non-http scheme and empty input', () => {
    expect(normalizeWorkLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeWorkLinkUrl('   ')).toBeNull();
  });
});

describe('makeWorkLink', () => {
  it('drops an empty label and keeps a step tag', () => {
    const link = makeWorkLink('example.com', 'uid-1', {
      label: '  ',
      stepId: 'step-2',
    });
    expect(link).not.toBeNull();
    expect(link).not.toHaveProperty('label');
    expect(link?.stepId).toBe('step-2');
    expect(link?.addedByUid).toBe('uid-1');
  });

  it('returns null for a url it will not store', () => {
    expect(makeWorkLink('javascript:alert(1)', 'uid-1')).toBeNull();
  });
});

describe('projectClassIdFor', () => {
  it('uses the ClassLink class when the roster has one', () => {
    expect(
      projectClassIdFor({ id: 'roster-1', classlinkClassId: 'section-a' })
    ).toBe('section-a');
  });

  it('falls back to a local id so a hand-built roster still tracks (D6)', () => {
    expect(projectClassIdFor({ id: 'roster-1' })).toBe('local:roster-1');
  });

  // A test-class sign-in carries the slug as its class claim.
  it('uses the test class when the roster came from one', () => {
    expect(
      projectClassIdFor({ id: 'roster-1', testClassId: 'mock-class' })
    ).toBe('mock-class');
  });

  it('treats a blank ClassLink id as no ClassLink class', () => {
    expect(projectClassIdFor({ id: 'roster-1', classlinkClassId: '  ' })).toBe(
      'local:roster-1'
    );
  });

  it('is null with no roster, which is what the board reads as no class', () => {
    expect(projectClassIdFor(undefined)).toBeNull();
  });
});
