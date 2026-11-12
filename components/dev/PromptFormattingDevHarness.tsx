/** DEV-only harness for the formatted question prompt at /prompt-formatting-dev. */
import React, { useRef, useState } from 'react';
import type { QuizQuestion } from '@/types';
import { QuestionPromptField } from '@/components/widgets/QuizWidget/components/QuestionFields';
import { QuestionPrompt } from '@/components/quiz/QuestionPrompt';

const START =
  'In your explanation, be sure to do the following:\n1. **Describe** the conditions that will *most likely* lead to an increase in S. satyrus beetle larvae.\n2. Explain ++why++ those conditions matter.\n\nUse evidence from both passages:\n• the field notes\n• the data table';

export const PromptFormattingDevHarness: React.FC = () => {
  const [q, setQ] = useState<QuizQuestion>({
    id: 'q1',
    type: 'free-response',
    text: START,
    correctAnswer: '',
    incorrectAnswers: [],
    timeLimit: 0,
  } as unknown as QuizQuestion);
  const [plain, setPlain] = useState<QuizQuestion>(q);
  const ref = useRef<HTMLTextAreaElement>(null);
  const ref2 = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 pb-24">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 p-6">
        <section
          className="space-y-3 rounded-xl border bg-white p-5"
          data-shot="editor"
        >
          <QuestionPromptField
            question={q}
            onChange={(u) => setQ((p) => ({ ...p, ...u }))}
            textareaRef={ref}
            promptFormat
            promptMath
            promptAccents="es"
          />
          <pre
            className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-500"
            data-shot="saved"
          >
            {q.text}
          </pre>
        </section>
        <section className="rounded-xl border bg-white p-6" data-shot="student">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Question 1 of 5
          </p>
          <QuestionPrompt text={q.text} light className="text-slate-900" />
        </section>
        <section
          className="space-y-3 rounded-xl border bg-white p-5"
          data-shot="flag-off"
        >
          <QuestionPromptField
            question={plain}
            onChange={(u) => setPlain((p) => ({ ...p, ...u }))}
            textareaRef={ref2}
            promptMath
            promptAccents="es"
          />
        </section>
      </div>
    </div>
  );
};
