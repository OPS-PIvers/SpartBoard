import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import {
  computeQuestionAccuracy,
  countCorrectAnswers,
} from '@/components/widgets/VideoActivityWidget/components/questionAccuracyStats';
import { videoActivityLiveRaw } from '@/utils/gradebook/liveRawScores';
import { videoItemRows } from '@/hooks/gradebook/useItemAnalysis';
import { parseMarkPoints } from '@/utils/videoActivityShortAnswerMark';
import { questionOptions } from '@/utils/videoActivityOptions';
import { buildVideoActivityResultsSheetData } from '@/utils/videoActivityDriveService';

const sa: VideoActivityQuestion = {
  id: 'sa',
  type: 'SA',
  text: 'Why?',
  timestamp: 10,
  timeLimit: 0,
  correctAnswer: '',
  incorrectAnswers: [],
  points: 2,
};

const response = (
  over: Partial<VideoActivityResponse> = {}
): VideoActivityResponse => ({
  studentUid: 'u1',
  joinedAt: 0,
  completedAt: 5,
  score: null,
  answers: [{ questionId: 'sa', answer: 'Because', answeredAt: 1 }],
  ...over,
});

const marked = (pointsAwarded: number) =>
  response({ grading: { sa: { pointsAwarded, gradedBy: 't', gradedAt: 1 } } });

describe('short answer in teacher views', () => {
  it('leaves unmarked answers out of accuracy and counts marked ones', () => {
    expect(computeQuestionAccuracy(sa, [response()])).toBe(0);
    expect(computeQuestionAccuracy(sa, [response(), marked(2)])).toBe(100);
    expect(countCorrectAnswers(marked(2), [sa])).toBe(1);
    expect(countCorrectAnswers(response(), [sa])).toBe(0);
  });

  it('keeps the live gradebook raw provisional until marked', () => {
    expect(videoActivityLiveRaw(response(), [sa])).toMatchObject({
      points: null,
      max: 2,
      state: 'awaiting-grade',
    });
    expect(videoActivityLiveRaw(marked(1), [sa])).toMatchObject({
      points: 1,
      max: 2,
      state: 'scored',
    });
  });

  it('item analysis skips unmarked answers without crashing', () => {
    expect(videoItemRows([sa], [response()])[0].pct).toBeNull();
    expect(videoItemRows([sa], [response(), marked(1)])[0].pct).toBe(50);
  });

  it('exports the teacher mark as the points', () => {
    const { dataRows } = buildVideoActivityResultsSheetData([marked(1)], [sa]);
    expect(dataRows[0][7]).toBe('1');
    expect(dataRows[0][6]).toBe('50%');
  });

  it('clamps a typed mark to the question points', () => {
    expect(parseMarkPoints('3', 2)).toBe(2);
    expect(parseMarkPoints('-1', 2)).toBe(0);
    expect(parseMarkPoints('1.5', 2)).toBe(1.5);
    expect(parseMarkPoints('', 2)).toBeNull();
    expect(parseMarkPoints('abc', 2)).toBeNull();
  });

  it('gives a short answer no options', () => {
    expect(
      questionOptions({ id: 'sa', type: 'SA', text: 'Why?', timestamp: 0 })
    ).toEqual([]);
  });
});
