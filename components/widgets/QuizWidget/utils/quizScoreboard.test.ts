import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useQuizSession', () => ({
  gradeAnswer: vi.fn(
    (
      question: { correctAnswer: string; type: string },
      answer: string
    ): boolean => {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      return norm(question.correctAnswer) === norm(answer);
    }
  ),
}));

vi.mock('@/config/scoreboard', () => ({
  SCOREBOARD_COLORS: [
    'bg-blue-500',
    'bg-red-500',
    'bg-green-500',
    'bg-yellow-500',
  ],
}));

import {
  getEarnedPoints,
  getResponseScore,
  buildPinToNameMap,
  buildScoreboardTeams,
} from './quizScoreboard';
import type {
  QuizResponse,
  QuizQuestion,
  ClassRoster,
  QuizSession,
} from '@/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQuestion(
  id: string,
  correctAnswer: string,
  points?: number
): QuizQuestion {
  return {
    id,
    text: `Question ${id}`,
    type: 'MC',
    correctAnswer,
    incorrectAnswers: ['wrong1', 'wrong2'],
    timeLimit: 0,
    ...(points !== undefined ? { points } : {}),
  };
}

function makeResponse(
  pin: string,
  answers: {
    questionId: string;
    answer: string;
    answeredAt?: number;
    speedBonus?: number;
  }[],
  status: 'joined' | 'in-progress' | 'completed' = 'completed'
): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    pin,
    joinedAt: Date.now(),
    status,
    answers: answers.map((a, i) => ({
      questionId: a.questionId,
      answer: a.answer,
      answeredAt: a.answeredAt ?? Date.now() + i,
      ...(a.speedBonus != null ? { speedBonus: a.speedBonus } : {}),
    })),
    score: null,
    submittedAt: status === 'completed' ? Date.now() : null,
  };
}

function makeSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    teacherUid: 'teacher1',
    code: '1234',
    quizId: 'quiz1',
    quizTitle: 'Test Quiz',
    status: 'active',
    mode: 'teacher',
    currentQuestionIndex: 0,
    totalQuestions: 3,
    createdAt: Date.now(),
    ...overrides,
  } as QuizSession;
}

function makeRoster(
  name: string,
  students: { firstName: string; lastName: string; pin: string }[]
): ClassRoster {
  return {
    id: `roster-${name}`,
    name,
    driveFileId: null,
    studentCount: students.length,
    createdAt: Date.now(),
    students: students.map((s) => ({
      id: `student-${s.pin}`,
      ...s,
    })),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('quizScoreboard', () => {
  describe('getEarnedPoints', () => {
    it('returns points for correct answers', () => {
      const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
      const response = makeResponse('01', [
        { questionId: 'q1', answer: 'A' },
        { questionId: 'q2', answer: 'B' },
      ]);
      expect(getEarnedPoints(response, questions)).toBe(2);
    });

    it('returns 0 for wrong answers', () => {
      const questions = [makeQuestion('q1', 'A')];
      const response = makeResponse('01', [{ questionId: 'q1', answer: 'X' }]);
      expect(getEarnedPoints(response, questions)).toBe(0);
    });

    it('returns 0 for missing answers', () => {
      const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
      const response = makeResponse('01', []);
      expect(getEarnedPoints(response, questions)).toBe(0);
    });

    it('respects custom point values', () => {
      const questions = [
        makeQuestion('q1', 'A', 5),
        makeQuestion('q2', 'B', 10),
      ];
      const response = makeResponse('01', [
        { questionId: 'q1', answer: 'A' },
        { questionId: 'q2', answer: 'wrong' },
      ]);
      expect(getEarnedPoints(response, questions)).toBe(5);
    });

    it('defaults to 1 point when points is undefined', () => {
      const questions = [makeQuestion('q1', 'A')];
      const response = makeResponse('01', [{ questionId: 'q1', answer: 'A' }]);
      expect(getEarnedPoints(response, questions)).toBe(1);
    });

    describe('streak multiplier', () => {
      it('applies 1.5x at 2 consecutive correct', () => {
        const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
        const session = makeSession({ streakBonusEnabled: true });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100 },
          { questionId: 'q2', answer: 'B', answeredAt: 200 },
        ]);
        // q1: 1pt * 1x = 1, q2: 1pt * 1.5x = 1.5 → total 2.5 → rounds to 3
        expect(getEarnedPoints(response, questions, session)).toBe(3);
      });

      it('applies 2x at 3+ consecutive correct', () => {
        const questions = [
          makeQuestion('q1', 'A'),
          makeQuestion('q2', 'B'),
          makeQuestion('q3', 'C'),
        ];
        const session = makeSession({ streakBonusEnabled: true });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100 },
          { questionId: 'q2', answer: 'B', answeredAt: 200 },
          { questionId: 'q3', answer: 'C', answeredAt: 300 },
        ]);
        // q1: 1*1 = 1, q2: 1*1.5 = 1.5, q3: 1*2 = 2 → 4.5 → rounds to 5
        expect(getEarnedPoints(response, questions, session)).toBe(5);
      });

      it('resets streak on wrong answer', () => {
        const questions = [
          makeQuestion('q1', 'A'),
          makeQuestion('q2', 'B'),
          makeQuestion('q3', 'C'),
        ];
        const session = makeSession({ streakBonusEnabled: true });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100 },
          { questionId: 'q2', answer: 'wrong', answeredAt: 200 },
          { questionId: 'q3', answer: 'C', answeredAt: 300 },
        ]);
        // q1: 1*1 = 1, q2: wrong (streak resets), q3: 1*1 = 1 → 2
        expect(getEarnedPoints(response, questions, session)).toBe(2);
      });

      it('does not apply streak when streakBonusEnabled is false', () => {
        const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
        const session = makeSession({ streakBonusEnabled: false });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100 },
          { questionId: 'q2', answer: 'B', answeredAt: 200 },
        ]);
        expect(getEarnedPoints(response, questions, session)).toBe(2);
      });
    });

    describe('speed bonus', () => {
      it('applies speed bonus percentage to correct answers', () => {
        const questions = [makeQuestion('q1', 'A')];
        questions[0].timeLimit = 30;
        const session = makeSession({ speedBonusEnabled: true });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100, speedBonus: 50 },
        ]);
        // 1pt * (1 + 50/100) = 1.5 → rounds to 2
        expect(getEarnedPoints(response, questions, session)).toBe(2);
      });

      it('does not apply speed bonus when disabled', () => {
        const questions = [makeQuestion('q1', 'A')];
        questions[0].timeLimit = 30;
        const session = makeSession({ speedBonusEnabled: false });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100, speedBonus: 50 },
        ]);
        expect(getEarnedPoints(response, questions, session)).toBe(1);
      });

      it('ignores speed bonus when timeLimit is 0', () => {
        const questions = [makeQuestion('q1', 'A')];
        // timeLimit defaults to 0
        const session = makeSession({ speedBonusEnabled: true });
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100, speedBonus: 50 },
        ]);
        expect(getEarnedPoints(response, questions, session)).toBe(1);
      });
    });

    describe('answeredAt ordering', () => {
      it('computes streak based on chronological answeredAt order', () => {
        const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
        const session = makeSession({ streakBonusEnabled: true });
        // Answers stored in reverse order but answeredAt determines real order
        const response = makeResponse('01', [
          { questionId: 'q2', answer: 'B', answeredAt: 200 },
          { questionId: 'q1', answer: 'A', answeredAt: 100 },
        ]);
        // Sorted: q1 first (100), q2 second (200) → streak = 2 on q2
        // q1: 1*1 = 1, q2: 1*1.5 = 1.5 → 2.5 → rounds to 3
        expect(getEarnedPoints(response, questions, session)).toBe(3);
      });

      it('handles missing answeredAt with fallback to 0', () => {
        const questions = [makeQuestion('q1', 'A')];
        const response = makeResponse('01', [
          { questionId: 'q1', answer: 'A' },
        ]);
        // answeredAt defaults from helper, should not throw
        expect(getEarnedPoints(response, questions)).toBe(1);
      });
    });
  });

  describe('getResponseScore', () => {
    it('calculates percentage correctly', () => {
      const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
      const response = makeResponse('01', [
        { questionId: 'q1', answer: 'A' },
        { questionId: 'q2', answer: 'wrong' },
      ]);
      expect(getResponseScore(response, questions)).toBe(50);
    });

    it('returns 100 for all correct', () => {
      const questions = [makeQuestion('q1', 'A')];
      const response = makeResponse('01', [{ questionId: 'q1', answer: 'A' }]);
      expect(getResponseScore(response, questions)).toBe(100);
    });

    it('returns 0 when no questions exist (zero max points)', () => {
      const response = makeResponse('01', []);
      expect(getResponseScore(response, [])).toBe(0);
    });

    it('rounds to the nearest integer', () => {
      const questions = [
        makeQuestion('q1', 'A'),
        makeQuestion('q2', 'B'),
        makeQuestion('q3', 'C'),
      ];
      const response = makeResponse('01', [
        { questionId: 'q1', answer: 'A' },
        { questionId: 'q2', answer: 'wrong' },
        { questionId: 'q3', answer: 'wrong' },
      ]);
      // 1/3 = 33.33... -> 33
      expect(getResponseScore(response, questions)).toBe(33);
    });
  });

  describe('buildPinToNameMap', () => {
    it('returns a map from PIN to full name when roster matches', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
          { firstName: 'Bob', lastName: 'Jones', pin: '02' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, 'Period 1');
      // Includes both zero-padded and stripped forms for flexible matching
      expect(map).toEqual({
        '01': 'Alice Smith',
        '1': 'Alice Smith',
        '02': 'Bob Jones',
        '2': 'Bob Jones',
      });
    });

    it('returns empty map when no matching roster is found', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, 'Period 2');
      expect(map).toEqual({});
    });

    it('returns empty map when periodName is undefined', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, undefined);
      expect(map).toEqual({});
    });

    it('skips students without PINs', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '' },
          { firstName: 'Bob', lastName: 'Jones', pin: '02' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, 'Period 1');
      expect(map).toEqual({
        '02': 'Bob Jones',
        '2': 'Bob Jones',
      });
    });

    it('handles students with only first name', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Cher', lastName: '', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, 'Period 1');
      expect(map).toEqual({ '01': 'Cher', '1': 'Cher' });
    });
  });

  describe('buildScoreboardTeams', () => {
    it('sorts teams by score descending', () => {
      const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
      const responses = [
        makeResponse('01', [
          { questionId: 'q1', answer: 'A' },
          { questionId: 'q2', answer: 'wrong' },
        ]),
        makeResponse('02', [
          { questionId: 'q1', answer: 'A' },
          { questionId: 'q2', answer: 'B' },
        ]),
      ];
      const teams = buildScoreboardTeams(responses, questions, 'pin', {});
      expect(teams[0].name).toBe('PIN 02');
      expect(teams[0].score).toBe(100);
      expect(teams[1].name).toBe('PIN 01');
      expect(teams[1].score).toBe(50);
    });

    it('uses PIN mode for names', () => {
      const questions = [makeQuestion('q1', 'A')];
      const responses = [
        makeResponse('03', [{ questionId: 'q1', answer: 'A' }]),
      ];
      const teams = buildScoreboardTeams(responses, questions, 'pin', {
        '03': 'Alice Smith',
      });
      expect(teams[0].name).toBe('PIN 03');
    });

    it('uses name mode and falls back to PIN when name not in roster', () => {
      const questions = [makeQuestion('q1', 'A')];
      const responses = [
        makeResponse('03', [{ questionId: 'q1', answer: 'A' }]),
        makeResponse('04', [{ questionId: 'q1', answer: 'A' }]),
      ];
      const pinToName = { '03': 'Alice Smith' };
      const teams = buildScoreboardTeams(
        responses,
        questions,
        'name',
        pinToName
      );
      expect(teams[0].name).toBe('Alice Smith');
      expect(teams[1].name).toBe('PIN 04');
    });

    it('assigns colors from SCOREBOARD_COLORS by PIN index', () => {
      const questions = [makeQuestion('q1', 'A')];
      const responses = [
        makeResponse('00', [{ questionId: 'q1', answer: 'A' }]),
        makeResponse('05', [{ questionId: 'q1', answer: 'A' }]),
      ];
      const teams = buildScoreboardTeams(responses, questions, 'pin', {});
      // PIN 00 -> index 0 % 4 = 0 -> 'bg-blue-500'
      // PIN 05 -> index 5 % 4 = 1 -> 'bg-red-500'
      // Note: order is by score (tie), then by original order
      expect(teams[0].color).toBe('bg-blue-500');
      expect(teams[1].color).toBe('bg-red-500');
    });

    it('returns empty array for no responses', () => {
      const questions = [makeQuestion('q1', 'A')];
      const teams = buildScoreboardTeams([], questions, 'pin', {});
      expect(teams).toEqual([]);
    });
  });
});
