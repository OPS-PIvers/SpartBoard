import { describe, expect, it } from 'vitest';
import {
  toPublicStep,
  isAnswerCorrect,
  buildGLResponsesCSV,
} from '@/hooks/useGuidedLearningSession';
import type {
  GuidedLearningResponse,
  GuidedLearningSet,
  GuidedLearningStep,
} from '@/types';

describe('toPublicStep', () => {
  it('forwards public-safe visual configuration fields', () => {
    const step: GuidedLearningStep = {
      id: 'step-1',
      xPct: 42,
      yPct: 64,
      imageIndex: 0,
      label: 'Focus area',
      interactionType: 'tooltip',
      hideStepNumber: true,
      showOverlay: 'tooltip',
      tooltipPosition: 'below',
      tooltipOffset: 24,
      text: 'Read this section carefully.',
      panZoomScale: 3,
      spotlightRadius: 30,
      bannerTone: 'red',
      autoAdvanceDuration: 7,
      question: {
        type: 'multiple-choice',
        text: 'What is 2 + 2?',
        choices: ['4', '5', '6'],
        correctAnswer: '4',
      },
    };

    const publicStep = toPublicStep(step);

    expect(publicStep.tooltipPosition).toBe('below');
    expect(publicStep.tooltipOffset).toBe(24);
    expect(publicStep.bannerTone).toBe('red');
    expect(publicStep.question?.text).toBe('What is 2 + 2?');
    expect(publicStep.question).not.toHaveProperty('correctAnswer');
  });
});

// ─── Helper to build a minimal matching step ──────────────────────────────────

function matchingStep(
  pairs: { left: string; right: string }[]
): GuidedLearningStep {
  return {
    id: 'step-m',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'question',
    question: {
      type: 'matching',
      text: 'Match each capital.',
      matchingPairs: pairs,
    },
  };
}

describe('isAnswerCorrect — matching', () => {
  const PAIRS = [
    { left: 'France', right: 'Paris' },
    { left: 'Germany', right: 'Berlin' },
  ];

  it('returns true when the student submits exactly the correct pairs', () => {
    expect(
      isAnswerCorrect(matchingStep(PAIRS), ['France:Paris', 'Germany:Berlin'])
    ).toBe(true);
  });

  it('returns true regardless of submission order', () => {
    expect(
      isAnswerCorrect(matchingStep(PAIRS), ['Germany:Berlin', 'France:Paris'])
    ).toBe(true);
  });

  it('returns false when a pair is wrong', () => {
    expect(
      isAnswerCorrect(matchingStep(PAIRS), ['France:Berlin', 'Germany:Paris'])
    ).toBe(false);
  });

  it('returns false when a pair is missing', () => {
    expect(isAnswerCorrect(matchingStep(PAIRS), ['France:Paris'])).toBe(false);
  });

  it('returns false when all correct pairs are present but extra wrong pairs are also submitted', () => {
    // Regression: before the fix, submitting every correct pair plus one wrong
    // pair passed the `every` check because it only tested the answer-key side.
    // The length guard makes this fail correctly.
    expect(
      isAnswerCorrect(matchingStep(PAIRS), [
        'France:Paris',
        'Germany:Berlin',
        'France:Berlin', // extra wrong pair
      ])
    ).toBe(false);
  });

  it('returns false when answer is not an array', () => {
    expect(isAnswerCorrect(matchingStep(PAIRS), 'France:Paris')).toBe(false);
  });

  it('returns false when matchingPairs is missing', () => {
    const step = matchingStep([]);
    // Remove the matchingPairs field to simulate a legacy/malformed question.
    const q = step.question;
    if (q) delete q.matchingPairs;
    expect(isAnswerCorrect(step, [])).toBe(false);
  });
});

// ─── buildGLResponsesCSV — duplicate-step dedup ──────────────────────────────

function mcQuestionStep(
  id: string,
  text: string,
  correct: string
): GuidedLearningStep {
  return {
    id,
    xPct: 0,
    yPct: 0,
    imageIndex: 0,
    interactionType: 'question',
    question: {
      type: 'multiple-choice',
      text,
      choices: [correct, 'wrong'],
      correctAnswer: correct,
    },
  };
}

function minimalSet(steps: GuidedLearningStep[]): GuidedLearningSet {
  return {
    id: 'set-1',
    title: 'Test Set',
    imageUrls: [],
    steps,
    mode: 'guided',
    createdAt: 0,
    updatedAt: 0,
  };
}

function minimalResponse(
  answers: Array<{ stepId: string; answer: string }>
): GuidedLearningResponse {
  return {
    sessionId: 'session-1',
    studentAnonymousId: 'student-1',
    startedAt: 0,
    completedAt: 1,
    score: null,
    answers: answers.map((a) => ({ ...a, isCorrect: null })),
  };
}

/** Parse the CSV string into a 2D array (headers + rows). Minimal RFC-4180. */
function parseCsv(csv: string): string[][] {
  return csv.split('\n').map((line) => {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  });
}

describe('buildGLResponsesCSV — duplicate-step dedup', () => {
  it('produces the correct column count when set.steps has no duplicates (baseline)', () => {
    // 2 unique question steps → 5 fixed cols + 2 answer cols + 2 correct cols = 9
    const set = minimalSet([
      mcQuestionStep('s1', 'What is 1+1?', '2'),
      mcQuestionStep('s2', 'What is 2+2?', '4'),
    ]);
    const response = minimalResponse([
      { stepId: 's1', answer: '2' },
      { stepId: 's2', answer: '4' },
    ]);

    const csv = buildGLResponsesCSV([response], set);
    const rows = parseCsv(csv);

    // Header row: Student ID, PIN, Started At, Completed At, Score (%), Q1, Q2, Q1 Correct, Q2 Correct
    expect(rows[0]).toHaveLength(9);
    expect(rows[0][5]).toBe('Q1: What is 1+1?');
    expect(rows[0][6]).toBe('Q2: What is 2+2?');
    expect(rows[0][7]).toBe('Q1 Correct');
    expect(rows[0][8]).toBe('Q2 Correct');
  });

  it('does NOT produce duplicate columns when set.steps contains a duplicate step id (Drive-sync dup)', () => {
    // Bug: the raw filter included both copies of s1, producing:
    //   headers[5]='Q1: What is 1+1?', headers[6]='Q2: What is 1+1?' (SAME question)
    //   and only 1 unique question counted as "Q3: What is 2+2?"
    // Fix: seenStepIds Set dedups to [s1, s2], giving the correct 9-col layout.
    const set = minimalSet([
      mcQuestionStep('s1', 'What is 1+1?', '2'), // first occurrence
      mcQuestionStep('s1', 'What is 1+1?', '2'), // Drive-sync duplicate
      mcQuestionStep('s2', 'What is 2+2?', '4'),
    ]);
    const response = minimalResponse([
      { stepId: 's1', answer: '2' },
      { stepId: 's2', answer: '4' },
    ]);

    const csv = buildGLResponsesCSV([response], set);
    const rows = parseCsv(csv);

    // With the fix: 2 unique questions → 9 columns (same as the no-dup baseline).
    // Without the fix: 3 "questions" → 11 columns (5 fixed + 3 answer + 3 correct).
    expect(rows[0]).toHaveLength(9);
    expect(rows[0][5]).toBe('Q1: What is 1+1?');
    expect(rows[0][6]).toBe('Q2: What is 2+2?');
    expect(rows[0][7]).toBe('Q1 Correct');
    expect(rows[0][8]).toBe('Q2 Correct');
  });

  it('keeps the first occurrence of a duplicate step and drops subsequent ones', () => {
    // The dedup Set uses insertion order so "Q1" always refers to the canonical
    // first entry. A second entry with the same id but different text would be
    // dropped — only the first is counted.
    const set = minimalSet([
      mcQuestionStep('s1', 'Original text', '2'),
      mcQuestionStep('s1', 'Phantom duplicate text', '2'), // same id, drift
    ]);
    const response = minimalResponse([{ stepId: 's1', answer: '2' }]);

    const csv = buildGLResponsesCSV([response], set);
    const rows = parseCsv(csv);

    // Only 1 question column: 5 fixed + 1 answer + 1 correct = 7 cols.
    expect(rows[0]).toHaveLength(7);
    // The header uses the FIRST occurrence's text.
    expect(rows[0][5]).toBe('Q1: Original text');
  });

  it('records "Yes" in the correct column for a correct answer with no duplicates', () => {
    const set = minimalSet([mcQuestionStep('s1', 'Q?', 'correct-answer')]);
    const response = minimalResponse([
      { stepId: 's1', answer: 'correct-answer' },
    ]);

    const csv = buildGLResponsesCSV([response], set);
    const rows = parseCsv(csv);

    // data row: row[1] (after header at row[0])
    // Columns: Student ID(0) PIN(1) Started(2) Completed(3) Score(4) Answer(5) Correct(6)
    expect(rows[1][6]).toBe('Yes');
  });
});
