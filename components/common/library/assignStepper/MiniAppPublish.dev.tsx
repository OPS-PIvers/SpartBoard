// DEV-only: what students see once a teacher publishes Mini App results, for /assign-stepper-dev.
import React from 'react';
import { MiniAppPublishedResults } from '@/components/miniApp/MiniAppPublishedResults';
import type { PublishedMiniAppResult } from '@/types';

const ITEMS: NonNullable<PublishedMiniAppResult['items']> = [
  {
    id: 'q1',
    prompt: 'Which fraction is larger?',
    answer: '3/4',
    correct: true,
    correctAnswer: '3/4',
  },
  {
    id: 'q2',
    prompt: '3/4 of 20',
    answer: 12,
    correct: false,
    correctAnswer: '15',
  },
  {
    id: 'q3',
    prompt: '2/4 equals 1/2',
    answer: true,
    correct: true,
    correctAnswer: 'True',
  },
  {
    id: 'q4',
    prompt: 'Name the top number',
    answer: 'Denominator',
    correct: false,
    correctAnswer: 'Numerator',
  },
  {
    id: 'q5',
    prompt: 'Build a pizza with 3/8 pepperoni',
    answer: { slices: 8, pepperoni: 3 },
    correct: true,
  },
];

const base = {
  studentUid: 'u1',
  publishedAt: 0,
  score: 3,
  maxScore: 5,
  gradedBy: 'server' as const,
  correctCount: 3,
  gradedCount: 5,
};

const RESULTS: PublishedMiniAppResult[] = [
  { ...base, visibility: 'score-only' },
  { ...base, visibility: 'score-responses-and-answers', items: ITEMS },
  {
    studentUid: 'u1',
    publishedAt: 0,
    visibility: 'score-and-responses',
    score: 4,
    maxScore: 5,
    gradedBy: 'app',
    details: {
      levelReached: 4,
      finished: true,
      timeSpentSeconds: 312,
      pizza: { slices: 8, pepperoni: 3 },
    },
  },
];

const Preview: React.FC = () => (
  <div
    className="flex flex-wrap items-start gap-6 p-4"
    data-testid="student-views"
  >
    {RESULTS.map((r) => (
      <div
        key={r.visibility}
        className="h-[760px] w-[390px] overflow-hidden rounded-2xl shadow-xl"
      >
        <MiniAppPublishedResults appTitle="Fractions check" result={r} />
      </div>
    ))}
  </div>
);

const MiniAppPublishDev = {
  title: 'Mini App published results',
  render: Preview,
};
export default MiniAppPublishDev;
