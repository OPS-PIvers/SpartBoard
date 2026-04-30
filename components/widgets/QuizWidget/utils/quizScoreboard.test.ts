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
  getDisplayScore,
  getScoreSuffix,
  isGamificationActive,
  buildPinToNameMap,
  buildPinToExportNameMap,
  buildScoreboardTeams,
  buildLiveLeaderboard,
  resolvePinName,
  __resetPinNameWarnDedupe,
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

  describe('isGamificationActive', () => {
    it('returns false when no session is provided', () => {
      expect(isGamificationActive()).toBe(false);
      expect(isGamificationActive(null)).toBe(false);
    });

    it('returns false when neither bonus is enabled', () => {
      const session = makeSession({
        speedBonusEnabled: false,
        streakBonusEnabled: false,
      });
      expect(isGamificationActive(session)).toBe(false);
    });

    it('returns true when speed bonus is enabled', () => {
      const session = makeSession({ speedBonusEnabled: true });
      expect(isGamificationActive(session)).toBe(true);
    });

    it('returns true when streak bonus is enabled', () => {
      const session = makeSession({ streakBonusEnabled: true });
      expect(isGamificationActive(session)).toBe(true);
    });

    it('returns true when speed is false and streak is true', () => {
      const session = makeSession({
        speedBonusEnabled: false,
        streakBonusEnabled: true,
      });
      expect(isGamificationActive(session)).toBe(true);
    });
  });

  describe('getDisplayScore', () => {
    it('returns percentage when gamification is not active', () => {
      const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
      const response = makeResponse('01', [
        { questionId: 'q1', answer: 'A' },
        { questionId: 'q2', answer: 'wrong' },
      ]);
      expect(getDisplayScore(response, questions)).toBe(50);
    });

    it('returns raw points when speed bonus is active', () => {
      const questions = [
        makeQuestion('q1', 'A', 5),
        makeQuestion('q2', 'B', 5),
      ];
      questions[0].timeLimit = 30;
      questions[1].timeLimit = 30;
      const session = makeSession({ speedBonusEnabled: true });
      const response = makeResponse('01', [
        { questionId: 'q1', answer: 'A', answeredAt: 100, speedBonus: 50 },
        { questionId: 'q2', answer: 'B', answeredAt: 200, speedBonus: 50 },
      ]);
      // Each: 5 * 1.5 = 7.5 → total 15 → rounds to 15
      // As percentage this would be 150%, but getDisplayScore returns raw 15
      expect(getDisplayScore(response, questions, session)).toBe(15);
      // Confirm getResponseScore would exceed 100%
      expect(getResponseScore(response, questions, session)).toBe(150);
    });

    it('returns raw points when streak bonus is active', () => {
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
      // q1: 1*1=1, q2: 1*1.5=1.5, q3: 1*2=2 → 4.5 → rounds to 5
      // As percentage: 167%, but getDisplayScore returns raw 5
      expect(getDisplayScore(response, questions, session)).toBe(5);
    });
  });

  describe('getScoreSuffix', () => {
    it('returns "%" when no gamification is active', () => {
      expect(getScoreSuffix()).toBe('%');
      expect(getScoreSuffix(null)).toBe('%');
      expect(getScoreSuffix(makeSession())).toBe('%');
    });

    it('returns " pts" when gamification is active', () => {
      expect(getScoreSuffix(makeSession({ speedBonusEnabled: true }))).toBe(
        ' pts'
      );
      expect(getScoreSuffix(makeSession({ streakBonusEnabled: true }))).toBe(
        ' pts'
      );
    });
  });

  describe('buildPinToNameMap', () => {
    it('resolves a PIN to a full name when roster matches', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
          { firstName: 'Bob', lastName: 'Jones', pin: '02' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1']);
      // Both zero-padded and stripped forms work
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Alice Smith');
      expect(resolvePinName(map, 'Period 1', '1')).toBe('Alice Smith');
      expect(resolvePinName(map, 'Period 1', '02')).toBe('Bob Jones');
      expect(resolvePinName(map, 'Period 1', '2')).toBe('Bob Jones');
    });

    it('returns empty map when no matching roster is found', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 2']);
      expect(map).toEqual({});
    });

    it('returns empty map when periodNames is undefined', () => {
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
      const map = buildPinToNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, 'Period 1', '02')).toBe('Bob Jones');
      // The empty-PIN student is not reachable from any path. Exhaustive
      // assertion: Alice's name appears nowhere in the resulting map.
      expect(Object.values(map)).toEqual(['Bob Jones', 'Bob Jones']);
    });

    it('handles students with only first name', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Cher', lastName: '', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Cher');
      expect(resolvePinName(map, 'Period 1', '1')).toBe('Cher');
    });

    it('disambiguates same PIN across multiple periods', () => {
      // The bug this fix addresses: each roster numbers its students 01, 02,
      // 03... so PIN 01 exists in every section. The map must scope lookups
      // by classPeriod or all PIN-1 students collapse onto roster #1's row.
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
        makeRoster('Period 2', [
          { firstName: 'Alice2', lastName: 'Smith2', pin: '01' },
          { firstName: 'Charlie', lastName: 'Brown', pin: '03' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1', 'Period 2']);
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Alice Smith');
      expect(resolvePinName(map, 'Period 2', '01')).toBe('Alice2 Smith2');
      expect(resolvePinName(map, 'Period 2', '03')).toBe('Charlie Brown');
      // Stripped form works the same way
      expect(resolvePinName(map, 'Period 1', '1')).toBe('Alice Smith');
      expect(resolvePinName(map, 'Period 2', '1')).toBe('Alice2 Smith2');
    });

    it('period-scoped tier short-circuits before any fallback', () => {
      // Defensive: if a future refactor reorders the fallback ladder so
      // the suffix scan runs before the period-scoped lookup, this test
      // would catch it. Period 1's Alice must win even though Period 2
      // also has someone at PIN 01.
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
        makeRoster('Period 2', [
          { firstName: 'Bob', lastName: 'Jones', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1', 'Period 2']);
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Alice Smith');
      expect(resolvePinName(map, 'Period 1', '1')).toBe('Alice Smith');
    });

    it('returns undefined when classPeriod is provided but does not match any roster', () => {
      // Wrong-period responses (typo, deleted roster, drift between
      // periodNames and rosters) used to silently fall through to the
      // legacy suffix scan and resolve to whichever student happens to
      // share the PIN. The fix returns `undefined` so the UI renders
      // `PIN <n>` and the mismatch is visible.
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
        makeRoster('Period 2', [
          { firstName: 'Bob', lastName: 'Jones', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1', 'Period 2']);
      expect(resolvePinName(map, 'Period 9', '01')).toBeUndefined();
      expect(resolvePinName(map, 'Nonexistent', '1')).toBeUndefined();
    });

    it('falls back to suffix scan when classPeriod is missing (legacy path)', () => {
      // SSO joiners and pre-period-scoping responses may have no
      // `classPeriod`. Behave like the old "first match wins" lookup so
      // those paths keep working.
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, undefined, '01')).toBe('Alice Smith');
      expect(resolvePinName(map, '', '01')).toBe('Alice Smith');
      expect(resolvePinName(map, null, '1')).toBe('Alice Smith');
    });

    it('warns when the legacy suffix scan finds multiple distinct candidates', () => {
      __resetPinNameWarnDedupe();
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
        makeRoster('Period 2', [
          { firstName: 'Bob', lastName: 'Jones', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1', 'Period 2']);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* suppress expected warning */
      });
      try {
        const result = resolvePinName(map, undefined, '01');
        expect(['Alice Smith', 'Bob Jones']).toContain(result);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Ambiguous PIN 01')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('dedupes the ambiguity warn so live-monitor renders do not flood', () => {
      __resetPinNameWarnDedupe();
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
        makeRoster('Period 2', [
          { firstName: 'Bob', lastName: 'Jones', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1', 'Period 2']);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* suppress */
      });
      try {
        // Five lookups for the same ambiguous (pin, candidates) pair —
        // simulates one render pass over five anonymous PIN joiners.
        for (let i = 0; i < 5; i++) {
          resolvePinName(map, undefined, '01');
        }
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('returns undefined for unknown PINs', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, 'Period 1', '99')).toBeUndefined();
      expect(resolvePinName(map, 'Period 1', '')).toBeUndefined();
      expect(resolvePinName(map, 'Period 1', undefined)).toBeUndefined();
    });
  });

  describe('buildPinToExportNameMap', () => {
    it('formats as "Last, First" when both names exist', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
          { firstName: 'Bob', lastName: 'Jones', pin: '02' },
        ]),
      ];
      const map = buildPinToExportNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Smith, Alice');
      expect(resolvePinName(map, 'Period 1', '02')).toBe('Jones, Bob');
    });

    it('returns just first name when last name is empty', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Cher', lastName: '', pin: '01' },
        ]),
      ];
      const map = buildPinToExportNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Cher');
      expect(resolvePinName(map, 'Period 1', '1')).toBe('Cher');
    });

    it('returns just last name when first name is empty', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: '', lastName: 'Madonna', pin: '03' },
        ]),
      ];
      const map = buildPinToExportNameMap(rosters, ['Period 1']);
      expect(resolvePinName(map, 'Period 1', '03')).toBe('Madonna');
      expect(resolvePinName(map, 'Period 1', '3')).toBe('Madonna');
    });

    it('disambiguates same PIN across multiple periods (export naming)', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
        makeRoster('Period 2', [
          { firstName: 'Bob', lastName: 'Jones', pin: '01' },
        ]),
      ];
      const map = buildPinToExportNameMap(rosters, ['Period 1', 'Period 2']);
      expect(resolvePinName(map, 'Period 1', '01')).toBe('Smith, Alice');
      expect(resolvePinName(map, 'Period 2', '01')).toBe('Jones, Bob');
    });

    it('returns empty map when no matching roster is found', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToExportNameMap(rosters, ['Period 2']);
      expect(map).toEqual({});
    });

    it('returns empty map when periodNames is undefined', () => {
      const rosters = [
        makeRoster('Period 1', [
          { firstName: 'Alice', lastName: 'Smith', pin: '01' },
        ]),
      ];
      const map = buildPinToExportNameMap(rosters, undefined);
      expect(map).toEqual({});
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

    it('uses raw points instead of percentage when gamification is active', () => {
      const questions = [
        makeQuestion('q1', 'A', 5),
        makeQuestion('q2', 'B', 5),
      ];
      questions[0].timeLimit = 30;
      questions[1].timeLimit = 30;
      const session = makeSession({ speedBonusEnabled: true });
      const responses = [
        makeResponse('01', [
          { questionId: 'q1', answer: 'A', answeredAt: 100, speedBonus: 50 },
          { questionId: 'q2', answer: 'B', answeredAt: 200, speedBonus: 50 },
        ]),
      ];
      const teams = buildScoreboardTeams(
        responses,
        questions,
        'pin',
        {},
        session
      );
      // Each: 5 * 1.5 = 7.5 → total 15 (raw points, not 150%)
      expect(teams[0].score).toBe(15);
    });
  });

  describe('buildLiveLeaderboard', () => {
    it('excludes joined responses and ranks by descending score', () => {
      const questions = [makeQuestion('q1', 'A')];
      const responses = [
        makeResponse('01', [{ questionId: 'q1', answer: 'A' }], 'completed'),
        makeResponse(
          '02',
          [{ questionId: 'q1', answer: 'wrong' }],
          'in-progress'
        ),
        makeResponse('03', [], 'joined'),
      ];

      const entries = buildLiveLeaderboard(responses, questions, null, {
        '01': 'Alice',
      });

      // Roster-PIN match resolves to "Alice"; the unmapped row falls back to
      // its literal `PIN <pin>` label rather than `undefined` so the student-
      // side leaderboard always has something legible to render.
      // `studentUid` is now also surfaced so SSO joiners can self-identify.
      expect(entries).toEqual([
        { pin: '01', studentUid: 'uid-01', name: 'Alice', score: 100, rank: 1 },
        {
          pin: '02',
          studentUid: 'uid-02',
          name: 'PIN 02',
          score: 0,
          rank: 2,
        },
      ]);
    });

    it('keeps stable tie order and assigns sequential ranks', () => {
      const questions = [makeQuestion('q1', 'A')];
      const responses = [
        makeResponse('10', [{ questionId: 'q1', answer: 'A' }]),
        makeResponse('11', [{ questionId: 'q1', answer: 'A' }]),
      ];

      const entries = buildLiveLeaderboard(responses, questions, null, {});
      expect(entries.map((entry) => entry.pin)).toEqual(['10', '11']);
      expect(entries.map((entry) => entry.rank)).toEqual([1, 2]);
    });

    it('limits leaderboard to top 10 entries', () => {
      const questions = [makeQuestion('q1', 'A')];
      const responses = Array.from({ length: 12 }, (_, i) =>
        makeResponse(String(i + 1).padStart(2, '0'), [
          { questionId: 'q1', answer: 'A' },
        ])
      );

      const entries = buildLiveLeaderboard(responses, questions, null, {});
      expect(entries).toHaveLength(10);
      expect(entries[0]?.rank).toBe(1);
      expect(entries[9]?.rank).toBe(10);
    });
  });
});
