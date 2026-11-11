// Tab name and picture placement for one stimulus (docs/plans/QUIZ_MCA_PRACTICE.md M12–M13).
import React from 'react';
import type { QuizStimulus, QuizStimulusPlacement } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { hasStimulusTab } from '@/utils/quizStimulusTabs';
import { inputClass, labelClass } from './quizEditorFieldStyles';

export const StimulusTabFields: React.FC<{
  stimulus: QuizStimulus;
  index: number;
  onChange: (updates: Partial<QuizStimulus>) => void;
}> = ({ stimulus: s, index, onChange }) => {
  if (!hasStimulusTab(s.type)) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label htmlFor={`tab-label-${s.id}`} className={labelClass}>
          Tab name
        </label>
        <input
          id={`tab-label-${s.id}`}
          type="text"
          value={s.tabLabel ?? ''}
          maxLength={40}
          onChange={(e) =>
            onChange({ tabLabel: e.target.value ? e.target.value : undefined })
          }
          placeholder="Numbered when empty"
          title="Students see this name on the tab when a question has two or more stimuli."
          {...tourFieldAttr('quiz-stimuli.tab-label', 'quiz', String(index))}
          className={inputClass}
        />
      </div>
      {s.type === 'image' && (
        <div>
          <label htmlFor={`placement-${s.id}`} className={labelClass}>
            Show
          </label>
          <select
            id={`placement-${s.id}`}
            value={s.placement ?? ''}
            onChange={(e) =>
              onChange({
                placement: e.target.value
                  ? (e.target.value as QuizStimulusPlacement)
                  : undefined,
              })
            }
            title="Automatic puts a picture beside the question when two or more questions use it."
            {...tourFieldAttr('quiz-stimuli.placement', 'quiz', String(index))}
            className={`${inputClass} appearance-none`}
          >
            <option value="">Automatic</option>
            <option value="panel">Beside the question</option>
            <option value="inline">In the question</option>
          </select>
        </div>
      )}
    </div>
  );
};
