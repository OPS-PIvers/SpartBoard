import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A full-pane loading state unmounts the open Publish dialog mid-publish, so it pops back up after the toast.
const publishBlock = (file: string, startMarker: string, endMarker: string) => {
  const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('Publish results dialog loads without the loading pane', () => {
  it('Quiz', () => {
    const block = publishBlock(
      'components/widgets/QuizWidget/Widget.tsx',
      'const publishQuizScoresFor = async (',
      'const saveLastProtection'
    );
    expect(block).toContain('loadAnswerKeyQuizQuietly(');
    expect(block).not.toMatch(/\bloadAnswerKeyQuiz\(/);
    expect(block).not.toMatch(/\bloadQuiz\(/);
  });

  it('Guided Learning', () => {
    const block = publishBlock(
      'components/widgets/GuidedLearning/Widget.tsx',
      '<PublishScoresModal',
      '\n      )}\n'
    );
    expect(block).toContain('publishAssignmentScores(');
    expect(block).toContain('loadSetQuietly(');
    expect(block).not.toMatch(/\bloadSet\(/);
  });
});
