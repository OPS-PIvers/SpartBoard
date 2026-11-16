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

export interface WritingRulesValue {
  allowPaste: boolean;
  recordingNotice: boolean;
  studentCanViewRecord: boolean;
  spellCheck: boolean;
  timeLimitMinutes: number | null;
}

export interface WritingIntegrityValue {
  tabWarningsEnabled: boolean;
  focusLevel?: 'lock';
  blockPrint: boolean;
}

export const DEFAULT_WRITING_RULES: WritingRulesValue = {
  allowPaste: false,
  recordingNotice: true,
  studentCanViewRecord: false,
  spellCheck: true,
  timeLimitMinutes: null,
};

export const DEFAULT_WRITING_INTEGRITY: WritingIntegrityValue = {
  tabWarningsEnabled: true,
  blockPrint: false,
};

export function formatWritingRulesValue(v: WritingRulesValue): string {
  const parts = [
    v.allowPaste ? 'Paste on' : 'Paste off',
    v.spellCheck ? 'spell check on' : 'spell check off',
  ];
  if (v.timeLimitMinutes) parts.push(`${v.timeLimitMinutes} min`);
  return parts.join(', ');
}

export function formatWritingIntegrityValue(v: WritingIntegrityValue): string {
  if (!v.tabWarningsEnabled) return 'Off';
  return v.focusLevel === 'lock' ? 'Focus mode, fullscreen' : 'Focus mode';
}

const toggle = (field: string) =>
  tourFieldAttr('assign-rule.toggle', 'assign', field);

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
        anchor={toggle('writing-allow-paste')}
        checked={value.allowPaste}
        onChange={(allowPaste) => set({ allowPaste })}
      />
      <StepToggleRow
        label="Tell students their writing is recorded"
        anchor={toggle('writing-recording-notice')}
        checked={value.recordingNotice}
        onChange={(recordingNotice) => set({ recordingNotice })}
      />
      <StepToggleRow
        label="Students can replay their own writing"
        anchor={toggle('writing-student-record')}
        checked={value.studentCanViewRecord}
        onChange={(studentCanViewRecord) => set({ studentCanViewRecord })}
      />
      <StepToggleRow
        label="Spell check"
        anchor={toggle('writing-spell-check')}
        checked={value.spellCheck}
        onChange={(spellCheck) => set({ spellCheck })}
      />
      {timeLimitOn && (
        <StepToggleRow
          label="Time limit"
          anchor={toggle('time-limit')}
          checked={minutes != null}
          onChange={(on) =>
            set({ timeLimitMinutes: on ? DEFAULT_QUIZ_TIME_LIMIT_MINUTES : null })
          }
          field={
            minutes != null && (
              <StepNumberField
                value={minutes}
                min={QUIZ_TIME_LIMIT_MIN_MINUTES}
                max={QUIZ_TIME_LIMIT_MAX_MINUTES}
                ariaLabel="Minutes"
                anchor={tourFieldAttr('assign-rule.number', 'assign', 'time-limit')}
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
        anchor={toggle('focus-mode')}
        checked={value.tabWarningsEnabled}
        onChange={(tabWarningsEnabled) => set({ tabWarningsEnabled })}
      />
      {value.tabWarningsEnabled && pageProtectionsOn && (
        <StepSubRows>
          <StepToggleRow
            sub
            label="Require fullscreen"
            anchor={toggle('require-fullscreen')}
            checked={value.focusLevel === 'lock'}
            onChange={(on) => set({ focusLevel: on ? 'lock' : undefined })}
          />
        </StepSubRows>
      )}
      {pageProtectionsOn && (
        <StepToggleRow
          label="Block printing"
          anchor={toggle('writing-block-print')}
          checked={value.blockPrint}
          onChange={(blockPrint) => set({ blockPrint })}
        />
      )}
    </div>
  );
};
