import React, { useId, useState } from 'react';
import type { QuizBehaviorSettings } from '@/types';
import { formatBehaviorSummary } from '@/utils/quizBehavior';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import { QuizBehaviorSettingsPanel } from './QuizBehaviorSettingsPanel';

interface QuizAssignSettingsInlineProps {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
  hasManualGrading?: boolean;
  readAloudAvailable?: boolean;
}

/** Plan D12: one-line assessment settings summary that expands to the Quiz panel. */
export const QuizAssignSettingsInline: React.FC<
  QuizAssignSettingsInlineProps
> = ({ value, onChange, hasManualGrading = false, readAloudAvailable }) => {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const handRaiseMode = useQuizHandRaiseMode();
  return (
    <div data-testid="quiz-assign-settings-inline" className="space-y-3">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="min-w-0 flex-1 text-slate-600">
          <span className="font-semibold text-slate-800">Settings: </span>
          <span data-testid="quiz-assign-settings-summary">
            {formatBehaviorSummary(value, { omitMode: true })}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={regionId}
          className="shrink-0 font-semibold text-brand-blue-primary hover:underline"
        >
          {open ? 'Done' : 'Edit'}
        </button>
      </div>
      {open && (
        <div id={regionId}>
          <QuizBehaviorSettingsPanel
            variant="quiz"
            value={value}
            onChange={onChange}
            handRaiseMode={handRaiseMode}
            hasManualGrading={hasManualGrading}
            readAloudAvailable={readAloudAvailable}
          />
        </div>
      )}
    </div>
  );
};
