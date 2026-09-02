import { describe, it, expect } from 'vitest';
import {
  applyMediaSlots,
  collectMediaSlots,
  gradingKey,
  parseGradingKey,
  readSlotGrade,
  resolveSlotState,
  selectGradedTake,
  slotNeedsManualGrading,
  takeUnplayableReason,
} from './mediaGrading';
import type {
  GradeResult,
  QuizQuestion,
  ResponseArtifact,
  WrittenAnswerGrade,
} from '@/types';

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

const question = (over: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    id: 'q1',
    text: 'Say it out loud',
    type: 'short',
    correctAnswer: '',
    incorrectAnswers: [],
    timeLimit: 0,
    points: 4,
    recording: RECORDING,
    ...over,
  }) as QuizQuestion;

const audio = (
  id: string,
  over: Partial<ResponseArtifact> = {}
): ResponseArtifact => ({
  id,
  slot: 'primary',
  kind: 'audio',
  uploadState: 'uploaded',
  durationMs: 10_000,
  ...over,
});

const grade = (over: Partial<WrittenAnswerGrade> = {}): WrittenAnswerGrade => ({
  pointsAwarded: 3,
  gradedBy: 'teacher',
  gradedAt: 1,
  ...over,
});

const AUTO_ZERO: GradeResult = {
  isCorrect: false,
  pointsEarned: 0,
  pointsMax: 4,
  state: 'not-attempted',
};

describe('gradingKey / parseGradingKey', () => {
  it('leaves the primary slot unsuffixed so old grades keep their meaning', () => {
    expect(gradingKey('q1', 'primary')).toBe('q1');
    expect(parseGradingKey('q1')).toEqual({
      questionId: 'q1',
      slot: 'primary',
    });
  });

  it('round-trips the addendum slot', () => {
    const key = gradingKey('q1', 'addendum');
    expect(key).toBe('q1::addendum');
    expect(parseGradingKey(key)).toEqual({
      questionId: 'q1',
      slot: 'addendum',
    });
  });

  it('treats a question id that itself contains :: as a primary key', () => {
    expect(parseGradingKey('a::b')).toEqual({
      questionId: 'a::b',
      slot: 'primary',
    });
  });

  it('reads a grade through the key helper', () => {
    const grading = {
      q1: grade(),
      'q1::addendum': grade({ pointsAwarded: 1 }),
    };
    expect(readSlotGrade(grading, 'q1')?.pointsAwarded).toBe(3);
    expect(readSlotGrade(grading, 'q1', 'addendum')?.pointsAwarded).toBe(1);
    expect(readSlotGrade(undefined, 'q1')).toBeUndefined();
  });
});

describe('slotNeedsManualGrading', () => {
  it('is true for any audio artifact, whatever the question type', () => {
    expect(slotNeedsManualGrading(question({ type: 'MC' }), audio('a'))).toBe(
      true
    );
  });

  it('is true for a text ADDENDUM and false for a text primary', () => {
    expect(
      slotNeedsManualGrading(
        question(),
        audio('a', { kind: 'text', slot: 'addendum' })
      )
    ).toBe(true);
    expect(
      slotNeedsManualGrading(
        question(),
        audio('a', { kind: 'text', slot: 'primary' })
      )
    ).toBe(false);
  });

  it('is false with no artifact at all', () => {
    expect(slotNeedsManualGrading(question(), undefined)).toBe(false);
  });
});

describe('collectMediaSlots', () => {
  it('returns nothing for a question with no recording block', () => {
    const q = question({ recording: undefined });
    expect(
      collectMediaSlots(q, {
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            artifacts: [audio('a')],
          },
        ],
      })
    ).toEqual([]);
  });

  it('orders takes highest-first and skips failed uploads', () => {
    const slots = collectMediaSlots(question(), {
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1,
          takeIndex: 1,
          artifacts: [audio('a1')],
        },
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 2,
          takeIndex: 2,
          artifacts: [audio('a2')],
        },
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 3,
          takeIndex: 3,
          artifacts: [audio('a3', { uploadState: 'failed' })],
        },
      ],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].takes.map((t) => t.takeIndex)).toEqual([2, 1]);
  });

  it('marks a capture-unavailable slot only when no take landed', () => {
    const answers = [
      {
        questionId: 'q1',
        answer: '',
        answeredAt: 1,
        unresponded: 'capture-unavailable' as const,
      },
    ];
    expect(
      collectMediaSlots(question(), { answers })[0].captureUnavailable
    ).toBe(true);
    expect(
      collectMediaSlots(question(), {
        answers: [
          ...answers,
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 2,
            takeIndex: 1,
            artifacts: [audio('a')],
          },
        ],
      })[0].captureUnavailable
    ).toBe(false);
  });
});

describe('resolveSlotState', () => {
  const slotWithTake = (over: Partial<WrittenAnswerGrade> | null) =>
    collectMediaSlots(question(), {
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1,
          takeIndex: 1,
          artifacts: [audio('a')],
        },
      ],
      grading: over ? { q1: grade(over) } : undefined,
    })[0];

  it('is awaiting-grade for a recorded but ungraded take', () => {
    expect(resolveSlotState(slotWithTake(null))).toBe('awaiting-grade');
  });

  it('is scored once graded', () => {
    expect(resolveSlotState(slotWithTake({}))).toBe('scored');
  });

  it('keeps an excused slot awaiting-grade so the gradebook omits it', () => {
    expect(resolveSlotState(slotWithTake({ excused: true }))).toBe(
      'awaiting-grade'
    );
  });

  const unavailableSlot = (g?: WrittenAnswerGrade) =>
    collectMediaSlots(question(), {
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1,
          unresponded: 'capture-unavailable' as const,
        },
      ],
      grading: g ? { q1: g } : undefined,
    })[0];

  it('defaults an unadjudicated capture-unavailable slot to awaiting-grade', () => {
    expect(resolveSlotState(unavailableSlot())).toBe('awaiting-grade');
  });

  it('keeps a provisional base state instead of promoting the slot to scored', () => {
    expect(resolveSlotState(slotWithTake({}), 'awaiting-grade')).toBe(
      'awaiting-grade'
    );
    expect(resolveSlotState(slotWithTake({}), 'scored')).toBe('scored');
  });

  it('maps Blank to not-attempted and an offline substitute to scored', () => {
    expect(resolveSlotState(unavailableSlot(grade({ pointsAwarded: 0 })))).toBe(
      'not-attempted'
    );
    expect(
      resolveSlotState(
        unavailableSlot(grade({ overallComment: 'Answered aloud at my desk' }))
      )
    ).toBe('scored');
  });
});

describe('selectGradedTake', () => {
  const slot = collectMediaSlots(question(), {
    answers: [1, 2, 3].map((i) => ({
      questionId: 'q1',
      answer: '',
      answeredAt: i,
      takeIndex: i,
      artifacts: [audio(`a${i}`)],
    })),
    grading: { q1: grade({ gradedTakeIndex: 1 }) },
  })[0];

  it('honours a pinned take', () => {
    expect(selectGradedTake(slot)?.takeIndex).toBe(1);
  });

  it('falls back to the winning take when nothing is pinned', () => {
    expect(selectGradedTake({ ...slot, grade: grade() })?.takeIndex).toBe(3);
  });
});

describe('applyMediaSlots', () => {
  it('returns the auto result untouched for a question with no recording', () => {
    const base: GradeResult = {
      isCorrect: true,
      pointsEarned: 4,
      pointsMax: 4,
      state: 'scored',
    };
    expect(
      applyMediaSlots(question({ recording: undefined }), { answers: [] }, base)
    ).toBe(base);
  });

  it('replaces a silent auto zero with awaiting-grade for a recorded answer', () => {
    const result = applyMediaSlots(
      question(),
      {
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            takeIndex: 1,
            artifacts: [audio('a')],
          },
        ],
      },
      AUTO_ZERO
    );
    expect(result.state).toBe('awaiting-grade');
    expect(result.pointsEarned).toBe(0);
  });

  it('scores the recorded slot from the manual grade', () => {
    const result = applyMediaSlots(
      question(),
      {
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            takeIndex: 1,
            artifacts: [audio('a')],
          },
        ],
        grading: { q1: grade({ pointsAwarded: 3 }) },
      },
      AUTO_ZERO
    );
    expect(result).toMatchObject({ pointsEarned: 3, state: 'scored' });
  });

  it('adds an addendum grade to the auto-scored primary, clamped at the max', () => {
    const q = question({ type: 'MC', points: 4 });
    const base: GradeResult = {
      isCorrect: true,
      pointsEarned: 4,
      pointsMax: 4,
      state: 'scored',
    };
    const response = {
      answers: [
        {
          questionId: 'q1',
          answer: 'A',
          answeredAt: 1,
          artifacts: [audio('a', { slot: 'addendum' as const })],
        },
      ],
      grading: { 'q1::addendum': grade({ pointsAwarded: 2 }) },
    };
    expect(applyMediaSlots(q, response, base).pointsEarned).toBe(4);
  });

  it('marks the whole question provisional while an addendum is ungraded', () => {
    const q = question({ type: 'MC', points: 4 });
    const base: GradeResult = {
      isCorrect: true,
      pointsEarned: 4,
      pointsMax: 4,
      state: 'scored',
    };
    const result = applyMediaSlots(
      q,
      {
        answers: [
          {
            questionId: 'q1',
            answer: 'A',
            answeredAt: 1,
            artifacts: [audio('a', { slot: 'addendum' as const })],
          },
        ],
      },
      base
    );
    expect(result.state).toBe('awaiting-grade');
  });

  it('leaves a partially-scored rubric awaiting-grade on a recorded essay', () => {
    const base: GradeResult = {
      isCorrect: false,
      pointsEarned: 3,
      pointsMax: 4,
      state: 'awaiting-grade',
    };
    const result = applyMediaSlots(
      question({ type: 'essay' }),
      {
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            takeIndex: 1,
            artifacts: [audio('a')],
          },
        ],
        grading: { q1: grade({ pointsAwarded: 3 }) },
      },
      base
    );
    expect(result.state).toBe('awaiting-grade');
  });

  it('does not treat a written grade with no take as a media primary slot', () => {
    const base: GradeResult = {
      isCorrect: false,
      pointsEarned: 3,
      pointsMax: 4,
      state: 'awaiting-grade',
    };
    const result = applyMediaSlots(
      question({ type: 'essay' }),
      {
        answers: [{ questionId: 'q1', answer: 'typed instead', answeredAt: 1 }],
        grading: { q1: grade({ pointsAwarded: 3 }) },
      },
      base
    );
    expect(result).toMatchObject({ pointsEarned: 3, state: 'awaiting-grade' });
  });

  it('an excused slot omits the student rather than scoring a zero', () => {
    const result = applyMediaSlots(
      question(),
      {
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            unresponded: 'capture-unavailable' as const,
          },
        ],
        grading: { q1: grade({ pointsAwarded: 0, excused: true }) },
      },
      AUTO_ZERO
    );
    expect(result.state).toBe('awaiting-grade');
  });
});

describe('takeUnplayableReason', () => {
  const take = (archiveStatus: string, driveFileId?: string) =>
    collectMediaSlots(question(), {
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1,
          takeIndex: 1,
          artifacts: [audio('a')],
        },
      ],
      artifactArchive: {
        a: { archiveStatus, driveFileId } as never,
      },
    })[0].takes[0];

  it('is null once the take is archived with a Drive file', () => {
    expect(takeUnplayableReason(take('archived', 'file-1'))).toBeNull();
  });

  it('reports every non-playable lifecycle value', () => {
    expect(takeUnplayableReason(take('syncing'))).toBe('archiving');
    expect(takeUnplayableReason(take('failed'))).toBe('archive-failed');
    expect(takeUnplayableReason(take('deleting'))).toBe('deleted');
    expect(takeUnplayableReason(take('deleted'))).toBe('deleted');
    expect(takeUnplayableReason(take('delete-failed'))).toBe('deleted');
    expect(takeUnplayableReason(take('archived'))).toBe('archiving');
    expect(takeUnplayableReason(undefined)).toBe('unknown');
  });
});
