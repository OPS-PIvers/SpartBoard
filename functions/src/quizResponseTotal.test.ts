import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreResponseTotal } from './quizResponseTotal';
import {
  computeAssessmentAggregate,
  parseSyncedQuestion,
  resolveGroupQuestions,
  type GroupQuestion,
  type ManualGrade,
  type RawAnswer,
} from './plcAssessmentMath';
import { scoreQuestions } from './gradebook/gradeRowMath';
import { parseKeyQuestions, scoreAttempt } from './quizScoreOnSubmit';
import type { ChooseSection } from './quizSectionsChosen';

// One whole-response cases file, run through the engine and every server consumer (AB-389).
interface TotalCase {
  name: string;
  questions: Record<string, unknown>[];
  answers: RawAnswer[];
  servedQuestionIds?: string[];
  sections?: ChooseSection[];
  countedChoices?: Record<string, string[]>;
  manualGrades?: Record<string, ManualGrade>;
  paperAttested?: boolean;
  paperWrittenQuestionIds?: string[];
  expect: {
    earned: number;
    max: number;
    gradedMax: number;
    awaiting: boolean;
    noKey: boolean;
    unknownServed: string[];
    notCounted: string[];
  };
  /** Score-on-submit percent, or null when it must leave the attempt to the teacher. */
  onSubmit?: number | null;
  /** PLC aggregate percent for this one student, or null when it can't score them. */
  plc?: number | null;
}

const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'quizResponseTotal.cases.json'), 'utf8')
) as TotalCase[];

const keyOf = (c: TotalCase): GroupQuestion[] =>
  c.questions
    .map(parseSyncedQuestion)
    .filter((q): q is GroupQuestion => q !== null);

describe('scoreResponseTotal whole-response cases', () => {
  it.each(cases)('$name', (c) => {
    const total = scoreResponseTotal({
      questions: keyOf(c),
      answers: c.answers,
      servedQuestionIds: c.servedQuestionIds,
      sections: c.sections,
      countedChoices: c.countedChoices,
      manualGrades: c.manualGrades,
      paperAttested: c.paperAttested,
      paperWrittenQuestionIds: c.paperWrittenQuestionIds,
    });
    expect({
      earned: total.earned,
      max: total.max,
      gradedMax: total.gradedMax,
      awaiting: total.awaiting,
      noKey: total.noKey,
      unknownServed: total.unknownServed,
      notCounted: total.questions
        .filter((t) => !t.counted)
        .map((t) => t.question.id),
    }).toEqual(c.expect);
  });
});

describe('gradebook scoreQuestions matches the cases', () => {
  it.each(cases)('$name', (c) => {
    const score = scoreQuestions({
      questions: keyOf(c),
      answers: c.answers,
      servedQuestionIds: c.servedQuestionIds,
      sectionsRaw: c.sections,
      countedChoices: c.countedChoices,
      manualGrades: c.manualGrades,
      paperAttested: c.paperAttested,
      paperWrittenQuestionIds: c.paperWrittenQuestionIds,
    });
    expect({
      earned: score.earned,
      max: score.max,
      awaiting: score.awaiting,
      noKey: score.noKey,
    }).toEqual({
      earned: c.expect.earned,
      max: c.expect.max,
      awaiting: c.expect.awaiting,
      noKey: c.expect.noKey,
    });
  });
});

describe('score-on-submit matches the cases', () => {
  it.each(cases.filter((c) => c.onSubmit !== undefined))('$name', (c) => {
    const result = scoreAttempt(
      {
        status: 'completed',
        completedAttempts: 0,
        answers: c.answers,
        ...(c.servedQuestionIds
          ? { servedQuestionIds: c.servedQuestionIds }
          : {}),
        ...(c.countedChoices
          ? { countedChoices: { attempt: 0, bySection: c.countedChoices } }
          : {}),
      },
      {
        questions: parseKeyQuestions(c.questions),
        sections: c.sections ?? [],
        fibAnswersByQuestion: {},
        paperWrittenQuestionIds: c.paperWrittenQuestionIds,
      }
    );
    expect(result?.score ?? null).toBe(c.onSubmit);
  });
});

describe('PLC aggregate matches the cases', () => {
  it.each(cases.filter((c) => c.plc !== undefined))('$name', (c) => {
    const publicQuestions = c.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
    }));
    const agg = computeAssessmentAggregate({
      assessmentId: 'a1',
      title: 'Cases',
      kind: 'quiz',
      groupQuestions: resolveGroupQuestions(
        { questions: c.questions },
        publicQuestions
      ),
      sessions: [
        {
          id: 's1',
          teacherUid: 't1',
          teacherName: 'T',
          publicQuestions,
          scorePublishedAt: null,
          ...(c.sections ? { sections: c.sections } : {}),
          ...(c.paperWrittenQuestionIds
            ? { paperWrittenQuestionIds: c.paperWrittenQuestionIds }
            : {}),
          responses: [
            {
              studentUid: 'u1',
              score: null,
              answers: c.answers,
              servedQuestionIds: c.servedQuestionIds,
              countedChoices: c.countedChoices,
              manualGrades: c.manualGrades,
              paperAttested: c.paperAttested,
            },
          ],
        },
      ],
    });
    expect(agg.scoredStudentCount === 0 ? null : agg.teamAveragePercent).toBe(
      c.plc
    );
  });
});

// Totals come from scoreResponseTotal only; these call the per-question grader for verdicts, not totals.
const GRADER_CALLERS = new Set([
  'quizResponseTotal.ts',
  'getMyQuizAttempts.ts',
  'checkQuizGameAnswer.ts',
]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'testing' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });

describe('one response-total path', () => {
  it('no new server file grades questions on its own', () => {
    const offenders = sourceFiles(__dirname)
      .filter((path) =>
        /\bgradeGroupAnswer\b/.test(
          readFileSync(path, 'utf8').replace(
            'export function gradeGroupAnswer(',
            ''
          )
        )
      )
      .map((path) => relative(__dirname, path))
      .filter((path) => !GRADER_CALLERS.has(path));
    expect(offenders).toEqual([]);
  });

  it.each([
    'gradebook/gradeRowMath.ts',
    'plcAssessmentMath.ts',
    'quizScoreOnSubmit.ts',
  ])('%s totals through scoreResponseTotal', (path) => {
    expect(readFileSync(join(__dirname, path), 'utf8')).toMatch(
      /\bscoreResponseTotal\(/
    );
  });
});
