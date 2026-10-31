import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import type { VideoActivityQuestion, WrittenAnswerGrade } from '@/types';

// Same cases the server grader (functions/src/videoActivityGrade.ts) runs, so the two can't drift.
interface GradeCase {
  name: string;
  question: Partial<VideoActivityQuestion> & { id: string };
  answer: string;
  grade?: { pointsAwarded: number };
  isCorrect: boolean;
  state?: string;
  pointsEarned?: number;
}

const cases = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'functions', 'src', 'videoActivityGrade.cases.json'),
    'utf8'
  )
) as GradeCase[];

describe('gradeVideoActivityAnswer shared cases', () => {
  it.each(cases)(
    '$name',
    ({ question, answer, grade, isCorrect, state, pointsEarned }) => {
      const manual = grade
        ? ({ ...grade, gradedBy: 't', gradedAt: 1 } as WrittenAnswerGrade)
        : undefined;
      const result = gradeVideoActivityAnswer(
        question as VideoActivityQuestion,
        answer,
        manual
      );
      expect(result.isCorrect).toBe(isCorrect);
      if (state !== undefined) expect(result.state).toBe(state);
      if (pointsEarned !== undefined)
        expect(result.pointsEarned).toBe(pointsEarned);
    }
  );
});
