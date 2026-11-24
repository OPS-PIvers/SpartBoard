import { describe, expect, it } from 'vitest';
import {
  groupFromStanding,
  groupRuleLabels,
  groupRulesOf,
  isBlankGroup,
  newModificationGroup,
  overrideForGroup,
  randomQuestionPick,
  editedOverrides,
} from './modificationGroups';
import { reducedQuestionsLabel } from '@/utils/quizOverrideServing';

const QS = Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}` }));

describe('fewer questions on a modification group', () => {
  it('draws the asked count in quiz order', () => {
    let seed = 7;
    const random = () =>
      ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pick = randomQuestionPick(QS, 4, random);
    expect(pick).toHaveLength(4);
    const order = QS.map((q) => q.id);
    expect(
      [...pick].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    ).toEqual(pick);
    expect(randomQuestionPick(QS, 0)).toHaveLength(1);
  });

  it('serves the group questions to every student in it', () => {
    const group = { ...newModificationGroup(), questionIds: ['q1', 'q3'] };
    expect(overrideForGroup(group, undefined).questionIds).toEqual([
      'q1',
      'q3',
    ]);
    expect(isBlankGroup(group)).toBe(false);
    expect(groupRuleLabels(group)).toContain('2 questions');
  });

  it('opens an edit on the saved questions and replaces them when the group changes', () => {
    const saved = { questionIds: ['q2'], timeMultiplier: 2 as const };
    const rules = groupRulesOf(saved);
    expect(rules?.questionIds).toEqual(['q2']);
    expect(groupFromStanding(rules ?? {}, ['s1']).questionIds).toEqual(['q2']);
    const next = editedOverrides(
      { s1: saved },
      { s1: saved },
      { s1: { timeMultiplier: 2 } }
    );
    expect(next.s1.questionIds).toBeUndefined();
  });
});

describe('reducedQuestionsLabel', () => {
  it('names a cut subset only', () => {
    expect(reducedQuestionsLabel(['q1', 'q2'], QS, false)).toBe(
      '2 of 10 questions'
    );
    expect(reducedQuestionsLabel(undefined, QS, false)).toBeNull();
    expect(
      reducedQuestionsLabel(
        QS.map((q) => q.id),
        QS,
        false
      )
    ).toBeNull();
    expect(reducedQuestionsLabel(['q1'], QS, true)).toBeNull();
  });
});
