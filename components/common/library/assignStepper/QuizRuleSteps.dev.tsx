// DEV-only preview of the Quiz rule step bodies in a stand-in step frame (the shell is slice 2).
/* eslint-disable react-refresh/only-export-components -- the harness reads a default { title, render } export */
import React, { useState } from 'react';
import type { QuizBehaviorSettings } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { QuizAttemptsStep } from './QuizAttemptsStep';
import { QuizIntegrityStep } from './QuizIntegrityStep';
import { QuizFeedbackStep } from './QuizFeedbackStep';
import { useQuizRuleGates } from './QuizRuleStepGates';
import {
  formatQuizAttemptsValue,
  formatQuizFeedbackValue,
  formatQuizIntegrityValue,
} from './QuizRuleStepValues';

const Frame: React.FC<{
  n: number;
  title: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}> = ({ n, title, value, open, onOpen, children }) => (
  <div
    className={`rounded-xl border bg-white ${open ? 'border-brand-blue-primary/40 shadow-sm' : 'border-slate-200'}`}
  >
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${open ? 'border-2 border-brand-blue-primary bg-white text-brand-blue-primary' : 'bg-slate-100 text-slate-500'}`}
      >
        {n}
      </span>
      <span
        className={`text-sm font-bold ${open ? 'text-brand-blue-dark' : 'text-slate-700'}`}
      >
        {title}
      </span>
      {!open && (
        <span className="ml-auto min-w-0 truncate pl-4 text-xs text-slate-500">
          {value}
        </span>
      )}
    </button>
    {open && <div className="px-4 pb-4 pl-[3.25rem]">{children}</div>}
  </div>
);

const Preview: React.FC = () => {
  const [value, setValue] = useState<QuizBehaviorSettings>(() => ({
    ...structuredClone(DEFAULT_QUIZ_BEHAVIOR),
    sessionOptions: {
      ...structuredClone(DEFAULT_QUIZ_BEHAVIOR.sessionOptions),
      tabAwayAutoSubmit: true,
      tabAwayLimitSeconds: 30,
      showScoreOnSubmit: true,
    },
  }));
  const gates = useQuizRuleGates();
  const [open, setOpen] = useState(3);
  return (
    <div className="mx-auto max-w-xl space-y-1.5">
      <Frame
        n={3}
        open={open === 3}
        onOpen={() => setOpen(3)}
        title="Attempts and order"
        value={formatQuizAttemptsValue(value, gates)}
      >
        <QuizAttemptsStep value={value} onChange={setValue} />
      </Frame>
      <Frame
        n={4}
        open={open === 4}
        onOpen={() => setOpen(4)}
        title="Quiz integrity"
        value={formatQuizIntegrityValue(value)}
      >
        <QuizIntegrityStep value={value} onChange={setValue} />
      </Frame>
      <Frame
        n={5}
        open={open === 5}
        onOpen={() => setOpen(5)}
        title="What students see"
        value={formatQuizFeedbackValue(value, gates)}
      >
        <QuizFeedbackStep
          value={value}
          onChange={setValue}
          handRaiseMode="teacher-choice"
        />
      </Frame>
    </div>
  );
};

export default {
  title: 'Quiz rule steps',
  render: () => <Preview />,
};
