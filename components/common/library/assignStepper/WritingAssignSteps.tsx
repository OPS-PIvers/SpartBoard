// The Writing assign stepper's own steps: Writing rules and Integrity (WRITING_ASSIGNMENT.md D8, D10, D11, D4, D7).
import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import {
  DEFAULT_QUIZ_TIME_LIMIT_MINUTES,
  QUIZ_TIME_LIMIT_MAX_MINUTES,
  QUIZ_TIME_LIMIT_MIN_MINUTES,
} from '@/utils/quizTimeLimit';
import { useQuizRuleGates } from './QuizRuleStepGates';
import { StepNumberField, StepSubRows, StepToggleRow } from './QuizStepRows';
import type {
  WritingIntegrityValue,
  WritingRulesValue,
} from './writingAssignValues';

export const WritingRulesStep: React.FC<{
  value: WritingRulesValue;
  onChange: (next: WritingRulesValue) => void;
}> = ({ value, onChange }) => {
  const { timeLimitOn } = useQuizRuleGates();
  const set = (patch: Partial<WritingRulesValue>) =>
    onChange({ ...value, ...patch });
  const minutes = value.timeLimitMinutes;
  return (
    <div className="space-y-1.5">
      <StepToggleRow
        label="Allow paste"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'writing-allow-paste'
        )}
        checked={value.allowPaste}
        onChange={(allowPaste) => set({ allowPaste })}
      />
      <StepToggleRow
        label="Tell students their writing is recorded"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'writing-recording-notice'
        )}
        checked={value.recordingNotice}
        onChange={(recordingNotice) => set({ recordingNotice })}
      />
      <StepToggleRow
        label="Students can replay their own writing"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'writing-student-record'
        )}
        checked={value.studentCanViewRecord}
        onChange={(studentCanViewRecord) => set({ studentCanViewRecord })}
      />
      <StepToggleRow
        label="Spell check"
        anchor={tourFieldAttr(
          'assign-rule.toggle',
          'assign',
          'writing-spell-check'
        )}
        checked={value.spellCheck}
        onChange={(spellCheck) => set({ spellCheck })}
      />
      {timeLimitOn && (
        <StepToggleRow
          label="Time limit"
          anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'time-limit')}
          checked={minutes != null}
          onChange={(on) =>
            set({
              timeLimitMinutes: on ? DEFAULT_QUIZ_TIME_LIMIT_MINUTES : null,
            })
          }
          field={
            minutes != null && (
              <StepNumberField
                value={minutes}
                min={QUIZ_TIME_LIMIT_MIN_MINUTES}
                max={QUIZ_TIME_LIMIT_MAX_MINUTES}
                ariaLabel="Minutes"
                anchor={tourFieldAttr(
                  'assign-rule.number',
                  'assign',
                  'time-limit'
                )}
                unit="min"
                onCommit={(timeLimitMinutes) => set({ timeLimitMinutes })}
              />
            )
          }
        />
      )}
    </div>
  );
};

export const WritingIntegrityStep: React.FC<{
  value: WritingIntegrityValue;
  onChange: (next: WritingIntegrityValue) => void;
}> = ({ value, onChange }) => {
  const { pageProtectionsOn } = useQuizRuleGates();
  const set = (patch: Partial<WritingIntegrityValue>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-1.5">
      <StepToggleRow
        label="Focus mode"
        anchor={tourFieldAttr('assign-rule.toggle', 'assign', 'focus-mode')}
        checked={value.tabWarningsEnabled}
        onChange={(tabWarningsEnabled) => set({ tabWarningsEnabled })}
      />
      {value.tabWarningsEnabled && pageProtectionsOn && (
        <StepSubRows>
          <StepToggleRow
            sub
            label="Require fullscreen"
            anchor={tourFieldAttr(
              'assign-rule.toggle',
              'assign',
              'require-fullscreen'
            )}
            checked={value.focusLevel === 'lock'}
            onChange={(on) => set({ focusLevel: on ? 'lock' : undefined })}
          />
        </StepSubRows>
      )}
      {pageProtectionsOn && (
        <StepToggleRow
          label="Block printing"
          anchor={tourFieldAttr(
            'assign-rule.toggle',
            'assign',
            'writing-block-print'
          )}
          checked={value.blockPrint}
          onChange={(blockPrint) => set({ blockPrint })}
        />
      )}
    </div>
  );
};
