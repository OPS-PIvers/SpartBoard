// DEV-only: the Video Activity editor on a fixture activity for /assign-stepper-dev screenshots.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React from 'react';
import { VideoActivityEditorModal } from '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal';
import type { VideoActivityData } from '@/types';

const ACTIVITY: VideoActivityData = {
  id: 'dev-cell-division',
  title: 'Cell Division',
  youtubeUrl: 'https://www.youtube.com/watch?v=f-ldPgEfAHI',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      timestamp: 42,
      timeLimit: 30,
      type: 'MC',
      text: 'What is the main purpose of mitosis?',
      correctAnswer: 'To make two identical cells',
      incorrectAnswers: [
        'To make sex cells',
        'To break down food',
        'To copy RNA',
      ],
      points: 1,
    },
    {
      id: 'q2',
      timestamp: 95,
      timeLimit: 30,
      type: 'FIB',
      text: 'The phase where chromosomes line up in the middle is called ___.',
      correctAnswer: 'metaphase',
      incorrectAnswers: [],
      acceptableVariants: ['meta phase'],
      points: 1,
    },
    {
      id: 'q3',
      timestamp: 151,
      timeLimit: 30,
      type: 'MA',
      text: 'Which of these happen during prophase?',
      correctAnswer: 'Chromosomes condense|The nuclear envelope breaks down',
      incorrectAnswers: ['The cell splits in two', 'DNA is copied'],
      allowPartialCredit: true,
      points: 2,
    },
    {
      id: 'q4',
      timestamp: 230,
      timeLimit: 30,
      type: 'MC',
      text: 'What happens during cytokinesis?',
      correctAnswer: 'The cytoplasm divides',
      incorrectAnswers: ['DNA replicates', 'Spindle fibers form'],
      points: 1,
    },
  ],
};

const Preview: React.FC = () => (
  <VideoActivityEditorModal
    isOpen
    activity={ACTIVITY}
    onClose={() => undefined}
    onSave={() => Promise.resolve()}
    autosave={false}
  />
);

const preview = { title: 'Video Activity editor', render: Preview };
export default preview;
