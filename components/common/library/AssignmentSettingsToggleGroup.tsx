/**
 * AssignmentSettingsToggleGroup — shared toggle surface used by every
 * Quiz-style assignment widget.
 *
 * Replaces the previously-duplicated `Quiz Integrity / Question Randomization /
 * Answer Feedback` sections that were copy-pasted between
 * `QuizManager.AssignExtraSlot`, `QuizAssignmentSettingsModal.extraSlot`, and
 * (now) the Video Activity assign modal. Widget-specific blocks (Quiz
 * gamification, VA rewind/penalty/scoreVisibility) plug in via `trailingSlot`.
 *
 * The component renders against the shared `BaseSessionOptions` shape — Quiz
 * and Video Activity options types both extend it. Widget-specific knobs
 * stay on the per-widget extension type and are owned by the parent.
 */

import React from 'react';
import { Lock } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { CollapsibleSection } from './CollapsibleSection';
import type { BaseSessionOptions } from '@/types';

/* ─── AttemptLimitRow ─────────────────────────────────────────────────────── */

interface AttemptOption {
  label: string;
  value: number | null;
}

const ATTEMPT_OPTIONS: AttemptOption[] = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: 'Unlimited', value: null },
];

export interface AttemptLimitRowProps {
  value: number | null;
  onChange: (v: number | null) => void;
  /**
   * Override the default helper text. Useful when the widget's reset
   * affordance differs (e.g. VA doesn't have a per-student reset on
   * the live monitor).
   */
  hint?: string;
}

export const AttemptLimitRow: React.FC<AttemptLimitRowProps> = ({
  value,
  onChange,
  hint = 'Remove a student from the live monitor to reset their attempt.',
}) => (
  <div>
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-brand-blue-dark">
        Attempts Allowed
      </span>
      <div
        role="group"
        aria-label="Attempts allowed"
        className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden"
      >
        {ATTEMPT_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={
                'px-3 py-1.5 text-xs font-bold transition ' +
                (active
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-600 hover:bg-slate-50')
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
    {hint && <p className="text-xxs text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/* ─── SectionHeader ───────────────────────────────────────────────────────── */

export const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest pt-1">
    {label}
  </p>
);

/* ─── ToggleRow ───────────────────────────────────────────────────────────── */

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
  /**
   * When true, the label renders in the small uppercase brand-blue style
   * used inside `CollapsibleSection` bodies. Top-level rows (e.g. Tab
   * Switch Detection) use the default bold-dark label.
   */
  compact?: boolean;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  checked,
  onChange,
  hint,
  disabled,
  compact = false,
}) => (
  <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
    <div className="flex items-center justify-between">
      <span
        className={
          compact
            ? 'text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest'
            : 'text-sm font-bold text-brand-blue-dark'
        }
      >
        {label}
      </span>
      <Toggle checked={checked} onChange={onChange} size="sm" showLabels />
    </div>
    {hint && <p className="text-xxs text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/* ─── Toggle group ────────────────────────────────────────────────────────── */

export type AssignmentSettingsSection =
  | 'integrity'
  | 'randomization'
  | 'feedback';

export interface AssignmentSettingsToggleGroupProps {
  options: BaseSessionOptions;
  onOptionsChange: (next: BaseSessionOptions) => void;
  /**
   * Optional cap on the number of completed attempts; `null` is unlimited.
   * When `attemptLimit` and `onAttemptLimitChange` are both provided, the
   * Attempts row renders inside the Quiz Integrity section. Omit both to
   * hide it (e.g. widgets that don't track attempt counts yet).
   */
  attemptLimit?: number | null;
  onAttemptLimitChange?: (next: number | null) => void;
  /** Override the AttemptLimitRow helper text. */
  attemptLimitHint?: string;
  /**
   * Header label for the integrity section. Defaults to "Quiz Integrity"
   * for backwards compat; widgets that aren't Quiz should pass a more
   * appropriate label (e.g. "Activity Integrity" for Video Activity).
   */
  integritySectionLabel?: string;
  /**
   * Quiz-only: when true, renders a "Session mode locked" banner above the
   * toggle group. VA has no session modes today and passes false.
   */
  modeLocked?: boolean;
  /**
   * When false, the "Shuffle Questions" toggle is rendered disabled with a
   * hint about self-paced mode. Quiz passes false for teacher/auto modes;
   * VA always passes true. Defaults to true.
   */
  shuffleQuestionsAvailable?: boolean;
  /**
   * Hide entire sections. Currently no widget needs this, but it keeps the
   * door open for widgets that don't expose, e.g., tab-switch detection.
   */
  excludeSections?: AssignmentSettingsSection[];
  /**
   * Optional content rendered after the standard sections. Quiz uses this
   * for the gamification block; VA uses this for rewind/penalty/score
   * visibility. The trailing block can use the exported `SectionHeader`
   * and `ToggleRow` to match the visual style.
   */
  trailingSlot?: React.ReactNode;
}

export const AssignmentSettingsToggleGroup: React.FC<
  AssignmentSettingsToggleGroupProps
> = ({
  options,
  onOptionsChange,
  attemptLimit,
  onAttemptLimitChange,
  attemptLimitHint,
  modeLocked = false,
  shuffleQuestionsAvailable = true,
  excludeSections,
  trailingSlot,
  integritySectionLabel,
}) => {
  const update = <K extends keyof BaseSessionOptions>(
    key: K,
    value: BaseSessionOptions[K]
  ) => onOptionsChange({ ...options, [key]: value });

  const showSection = (section: AssignmentSettingsSection): boolean =>
    !excludeSections?.includes(section);

  const showAttempts =
    attemptLimit !== undefined && onAttemptLimitChange !== undefined;

  return (
    <>
      {modeLocked && (
        <div className="flex items-center gap-1.5 text-xxs font-bold text-slate-400 uppercase tracking-widest -mt-2">
          <Lock className="w-3 h-3" />
          Session mode locked
          <span className="font-normal text-slate-400 normal-case tracking-normal">
            — make this assignment inactive to change it.
          </span>
        </div>
      )}

      {showSection('integrity') && (
        <>
          <SectionHeader label={integritySectionLabel ?? 'Quiz Integrity'} />
          {showAttempts && (
            <AttemptLimitRow
              value={attemptLimit ?? null}
              onChange={onAttemptLimitChange}
              hint={attemptLimitHint}
            />
          )}
          <ToggleRow
            label="Tab Switch Detection"
            checked={options.tabWarningsEnabled ?? true}
            onChange={(v) => update('tabWarningsEnabled', v)}
            hint="Warn students who leave the assignment tab"
          />
        </>
      )}

      {showSection('randomization') && (
        <CollapsibleSection label="Question Randomization">
          <ToggleRow
            compact
            label="Shuffle Questions"
            checked={options.shuffleQuestions ?? false}
            onChange={(v) => update('shuffleQuestions', v)}
            disabled={!shuffleQuestionsAvailable}
            hint={
              shuffleQuestionsAvailable
                ? 'Each student gets a fresh question order on every attempt (self-paced mode)'
                : 'Available in self-paced mode only.'
            }
          />
          <ToggleRow
            compact
            label="Shuffle Answer Options"
            checked={options.shuffleAnswerOptions ?? true}
            onChange={(v) => update('shuffleAnswerOptions', v)}
            hint="Randomize MC choices, matching pairs, and ordering items per student per attempt"
          />
        </CollapsibleSection>
      )}

      {showSection('feedback') && (
        <CollapsibleSection label="Answer Feedback">
          <ToggleRow
            compact
            label="Show right/wrong to students"
            checked={options.showResultToStudent ?? false}
            onChange={(v) => update('showResultToStudent', v)}
            hint="Students see ✓ or ✗ after submitting"
          />
          <ToggleRow
            compact
            label="Reveal correct answer to students"
            checked={options.showCorrectAnswerToStudent ?? false}
            onChange={(v) => update('showCorrectAnswerToStudent', v)}
            disabled={!options.showResultToStudent}
            hint="Also show what the correct answer was"
          />
          <ToggleRow
            compact
            label="Show correct answer on board"
            checked={options.showCorrectOnBoard ?? false}
            onChange={(v) => update('showCorrectOnBoard', v)}
            hint="Display correct answer on the projected screen"
          />
        </CollapsibleSection>
      )}

      {trailingSlot}
    </>
  );
};
