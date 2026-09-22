import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import type { VideoActivityQuestion } from '@/types';

// Same cases the server grader (functions/src/videoActivityGrade.ts) runs, so the two can't drift.
interface GradeCase {
  name: string;
  question: Partial<VideoActivityQuestion> & { id: string };
  answer: string;
  isCorrect: boolean;
}

const cases = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'functions', 'src', 'videoActivityGrade.cases.json'),
    'utf8'
  )
) as GradeCase[];

describe('gradeVideoActivityAnswer shared cases', () => {
  it.each(cases)('$name', ({ question, answer, isCorrect }) => {
    expect(
      gradeVideoActivityAnswer(question as VideoActivityQuestion, answer)
        .isCorrect
    ).toBe(isCorrect);
  });
});
