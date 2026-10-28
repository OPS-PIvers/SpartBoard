import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { videoActivityAnswerRules } from '@/utils/videoActivityAnswerRules';
import { questionOptions } from '@/utils/videoActivityOptions';
import type { VideoActivitySession } from '@/types';

// Same cases the server check (functions/src/videoActivityGrade.ts) runs, so the two can't drift.
interface AnswerRulesCase {
  name: string;
  settings: VideoActivitySession['settings'];
  sessionOptions: VideoActivitySession['sessionOptions'] | null;
  expected: ReturnType<typeof videoActivityAnswerRules>;
}

const cases = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      'functions',
      'src',
      'videoActivityAnswerRules.cases.json'
    ),
    'utf8'
  )
) as AnswerRulesCase[];

describe('videoActivityAnswerRules shared cases', () => {
  it.each(cases)('$name', ({ settings, sessionOptions, expected }) => {
    expect(
      videoActivityAnswerRules({
        settings,
        sessionOptions: sessionOptions ?? undefined,
      })
    ).toEqual(expected);
  });

  it('plays a missing session as today', () => {
    expect(videoActivityAnswerRules(null)).toEqual({
      shuffleForEachStudent: false,
      showResult: true,
      revealAnswer: true,
      requireCorrectAnswer: true,
    });
  });
});

describe('questionOptions', () => {
  const q = {
    id: 'q1',
    timestamp: 0,
    text: 'Pick',
    type: 'MC' as const,
    options: ['a', 'b', 'c', 'd', 'e', 'f'],
  };

  it('gives every student the same order without a seed', () => {
    expect(questionOptions(q)).toEqual(questionOptions(q, null));
  });

  it('keeps one student order stable and varies it across students', () => {
    const one = questionOptions(q, 'stu-1:attempt-0');
    expect(questionOptions(q, 'stu-1:attempt-0')).toEqual(one);
    expect([...one].sort()).toEqual(q.options);
    const orders = new Set(
      Array.from({ length: 8 }, (_, i) =>
        questionOptions(q, `stu-${i}:attempt-0`).join()
      )
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('returns nothing for a typed answer', () => {
    expect(questionOptions({ ...q, type: 'FIB' }, 'stu-1')).toEqual([]);
  });
});
