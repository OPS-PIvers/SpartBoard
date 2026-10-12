// Mini App results on the assign stepper: attempts and what students see (docs/plans/MINI_APP_RESULTS.md D8, D9).
import React from 'react';
import { AttemptLimitRow } from '@/components/common/library/AssignmentSettingsToggleGroup';
import { StepToggleRow } from '@/components/common/library/assignStepper/QuizStepRows';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { MiniAppResultsChoice } from '@/utils/miniAppResults';

export const MiniAppResultsStep: React.FC<{
  value: MiniAppResultsChoice;
  onChange: (next: MiniAppResultsChoice) => void;
}> = ({ value, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex min-h-[2rem] flex-col justify-center">
      <AttemptLimitRow
        label="Attempts allowed"
        tooltip="The best attempt counts."
        value={value.attemptLimit}
        onChange={(attemptLimit) => onChange({ ...value, attemptLimit })}
      />
    </div>
    <StepToggleRow
      label="Show score and right and wrong to students"
      anchor={tourFieldAttr(
        'assign-rule.toggle',
        'assign',
        'mini-app-show-results'
      )}
      checked={value.showCorrectAnswers}
      onChange={(showCorrectAnswers) =>
        onChange({ ...value, showCorrectAnswers })
      }
    />
  </div>
);
