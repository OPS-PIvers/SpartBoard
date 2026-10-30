// DEV-ONLY: a colleague's quiz and video activity on a shared board, at widget sizes, against fixtures.

import React from 'react';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import { SharedBoardItemPanel } from '@/components/sharedBoard/SharedBoardItemGate';
import { QuizPreview } from '@/components/widgets/QuizWidget/components/QuizPreview';
import { VideoActivityPreview } from '@/components/widgets/VideoActivityWidget/components/VideoActivityPreview';
import type { QuizData, SubShareVideoActivityView } from '@/types';

const dashboard = {
  addToast: () => undefined,
  updateWidget: () => undefined,
} as unknown as DashboardContextValue;

const quiz: QuizData = {
  id: 'q1',
  title: 'Fractions check',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1-1',
      timeLimit: 0,
      type: 'MC',
      text: 'Which fraction is equal to 1/2?',
      correctAnswer: '2/4',
      incorrectAnswers: ['1/3', '3/4', '2/3'],
    },
    {
      id: 'q1-2',
      timeLimit: 0,
      type: 'MC',
      text: 'What is 3/4 + 1/4?',
      correctAnswer: '1',
      incorrectAnswers: ['4/8', '3/16', '1/2'],
    },
  ],
};

const activity: SubShareVideoActivityView = {
  id: 'va1',
  title: 'The water cycle',
  youtubeUrl: 'https://www.youtube.com/watch?v=al-do-HGuIk',
  createdAt: 0,
  updatedAt: 0,
  questions: [],
};

const SIZES = [
  { w: 420, h: 380 },
  { w: 640, h: 480 },
];

const Frame: React.FC<{ w: number; h: number; children: React.ReactNode }> = ({
  w,
  h,
  children,
}) => (
  <div
    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
    style={{ width: w, height: h, containerType: 'size' }}
  >
    {children}
  </div>
);

export const SharedBoardItemDevHarness: React.FC = () => (
  <DashboardContext.Provider value={dashboard}>
    <div className="h-screen h-dvh overflow-y-auto bg-slate-100 p-8 pb-16">
      {SIZES.map(({ w, h }) => (
        <div key={w} className="mb-8 flex flex-wrap items-start gap-8">
          <Frame w={w} h={h}>
            <SharedBoardItemPanel
              label="quiz"
              onCopy={() => new Promise(() => undefined)}
              onCopied={() => undefined}
            >
              <QuizPreview quiz={quiz} />
            </SharedBoardItemPanel>
          </Frame>
          <Frame w={w} h={h}>
            <SharedBoardItemPanel
              label="quiz"
              disabledReason="View only. This quiz draws from a colleague's question banks, so it can't be copied."
              onCopy={() => Promise.resolve('')}
              onCopied={() => undefined}
            >
              <QuizPreview quiz={quiz} />
            </SharedBoardItemPanel>
          </Frame>
          <Frame w={w} h={h}>
            <SharedBoardItemPanel
              label="video activity"
              onCopy={() => Promise.resolve('')}
              onCopied={() => undefined}
            >
              <VideoActivityPreview activity={activity} />
            </SharedBoardItemPanel>
          </Frame>
        </div>
      ))}
    </div>
  </DashboardContext.Provider>
);
