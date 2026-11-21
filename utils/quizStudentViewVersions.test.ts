import { describe, expect, it } from 'vitest';
import {
  overrideRuleLabels,
  previewOverride,
  STANDARD_VERSION_ID,
  versionsFromOverrides,
  versionsWithOptionText,
} from './quizStudentViewVersions';

const label = (code: string) => (code === 'es' ? 'Español' : code);

describe('previewOverride', () => {
  it('drops focus, window and paper fields', () => {
    expect(
      previewOverride({
        tabWarningThreshold: 2,
        tabAwayLimit: 'off',
        blockCopyPaste: true,
        openAt: 1,
        closeAt: 2,
        onPaper: true,
      })
    ).toBeUndefined();
  });

  it('keeps what changes the questions', () => {
    expect(
      previewOverride({
        timeMultiplier: 1.5,
        modifiedQuestions: true,
        tabWarningThreshold: 2,
      })
    ).toEqual({ timeMultiplier: 1.5, modifiedQuestions: true });
  });
});

describe('versionsFromOverrides', () => {
  it('is only Standard with no overrides', () => {
    expect(versionsFromOverrides(undefined, label)).toEqual([
      { id: STANDARD_VERSION_ID, label: 'Standard' },
    ]);
  });

  it('merges students with the same version and puts the biggest first', () => {
    const versions = versionsFromOverrides(
      {
        a: { language: 'es', readAloud: true },
        b: { timeMultiplier: 2, hiddenOptionIdsByQuestion: { q1: ['x'] } },
        c: { hiddenOptionIdsByQuestion: { q1: ['x'] }, timeMultiplier: 2 },
        d: { tabWarningThreshold: 'off' },
      },
      label
    );
    expect(versions.map((v) => v.label)).toEqual([
      'Standard',
      '2 students · 2x time, 1 wrong answer removed',
      '1 student · read aloud, Español',
    ]);
    expect(versions[1].override).toEqual({
      timeMultiplier: 2,
      hiddenOptionIdsByQuestion: { q1: ['x'] },
    });
  });
});

describe('overrideRuleLabels', () => {
  it('names each rule', () => {
    expect(
      overrideRuleLabels(
        {
          timeMultiplier: 'unlimited',
          hiddenOptionIdsByQuestion: { q1: ['a', 'b'] },
          questionIds: ['q1', 'q2'],
          modifiedQuestions: true,
          supports: [{ kind: 'text', title: 'Words', text: 'cat' }],
        },
        label
      )
    ).toEqual([
      'no time limit',
      'fewer answer choices',
      '2 questions',
      'modified questions',
      '1 support',
    ]);
  });
});

describe('versionsWithOptionText', () => {
  it('turns option ids into option text', () => {
    const [standard, group] = versionsWithOptionText(
      [
        { id: STANDARD_VERSION_ID, label: 'Standard' },
        {
          id: 'g1',
          label: 'Group 1',
          override: { hiddenOptionIdsByQuestion: { q1: ['q1-incorrect-1'] } },
        },
      ],
      [
        {
          id: 'q1',
          type: 'MC',
          text: 'Pick',
          correctAnswer: 'Right',
          incorrectAnswers: ['Wrong A', 'Wrong B'],
          timeLimit: 0,
        },
      ]
    );
    expect(standard.override).toBeUndefined();
    expect(group.override).toEqual({
      hiddenOptionIdsByQuestion: { q1: ['Wrong B'] },
    });
  });
});
