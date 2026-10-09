import React, { useContext, useState } from 'react';
import type {
  ClassRoster,
  FlashcardScoreVisibility,
  FlashcardSet,
  FlashcardTestType,
} from '@/types';
import { AssignModal } from '@/components/common/library/AssignModal';
import { AssignTargetingSection } from '@/components/common/library/AssignTargetingSection';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import type { AssignClassPickerValue } from '@/components/common/AssignClassPicker.helpers';
import { Toggle } from '@/components/common/Toggle';
import { AuthContext } from '@/context/AuthContextValue';
import {
  applyAvailability,
  type WorkKindSetting,
} from '@/utils/assignAvailability';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import {
  DEFAULT_FLASHCARD_ASSIGN_FORM,
  buildFlashcardAssignSubmission,
  flashcardTestCountOptions,
  isMcAvailable,
  rosterHasSsoClass,
  validateFlashcardAssignForm,
  type FlashcardAssignForm,
  type FlashcardAssignSubmission,
} from './utils/flashcardAssign';
import {
  FLASHCARD_MODE_OPTIONS as MODE_OPTIONS,
  FLASHCARD_SCORE_VISIBILITY_OPTIONS as SCORE_VISIBILITY_OPTIONS,
  FLASHCARD_SIDE_OPTIONS as SIDE_OPTIONS,
  FLASHCARD_TEST_TYPE_OPTIONS as TEST_TYPE_OPTIONS,
  FLASHCARD_THRESHOLD_OPTIONS as THRESHOLD_OPTIONS,
} from './utils/flashcardAssignOptions';
import { FlashcardAssignStepper } from './FlashcardAssignStepper';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface FlashcardAssignModalProps {
  isOpen: boolean;
  set: FlashcardSet;
  rosters: ClassRoster[];
  initialRosterIds?: string[];
  onClose: () => void;
  /** Resolves false when the assign failed. */
  onAssign: (submission: FlashcardAssignSubmission) => Promise<boolean | void>;
  /** Per-period mode and windows; undefined while the flag is off. */
  periodAccess?: AssignPeriodAccessContext;
}

const LABEL_CLASS =
  'block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1.5';

interface SegmentedProps<T extends string | number> {
  name: string;
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string | number>({
  name,
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>): React.ReactElement {
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{label}</legend>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={String(option.value)}
              {...tourFieldAttr(
                'flashcards-assign.segmented',
                'assign',
                `${name}:${String(option.value)}`
              )}
              className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-center text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-brand-blue-primary ${
                selected
                  ? 'bg-white text-brand-blue-primary shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The accordion stepper behind `assign-stepper`, otherwise today's dialog (D16). */
export const FlashcardAssignModal: React.FC<FlashcardAssignModalProps> = (
  props
) => {
  const auth = useContext(AuthContext);
  return auth?.canAccessFeature('assign-stepper') === true ? (
    <FlashcardAssignStepper {...props} />
  ) : (
    <LegacyFlashcardAssignModal {...props} />
  );
};

export const LegacyFlashcardAssignModal: React.FC<
  FlashcardAssignModalProps
> = ({
  isOpen,
  set,
  rosters,
  initialRosterIds = [],
  onClose,
  onAssign,
  periodAccess,
}) => {
  const [form, setForm] = useState<FlashcardAssignForm>(
    DEFAULT_FLASHCARD_ASSIGN_FORM
  );
  const [pickerValue, setPickerValue] = useState<AssignClassPickerValue>({
    rosterIds: initialRosterIds,
  });
  const auth = useContext(AuthContext);
  const availabilityOn = auth?.canAccessFeature('assign-availability') === true;
  const workKindSetting: WorkKindSetting | undefined =
    auth?.canAccessFeature('study-resources') === true
      ? form.collectSubmission
        ? { default: 'work' }
        : { default: 'resource', locked: true }
      : undefined;
  const [targetingValue, setTargetingValue] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );

  const cardCount = set.cards.length;
  const mcAvailable = isMcAvailable(cardCount);
  const update = (patch: Partial<FlashcardAssignForm>): void =>
    setForm((prev) => ({ ...prev, ...patch }));

  const formError = validateFlashcardAssignForm(form, cardCount);
  const hasSsoClass = rosters.some(
    (roster) =>
      pickerValue.rosterIds.includes(roster.id) && rosterHasSsoClass(roster)
  );
  const disabledReason =
    formError === 'no-cards'
      ? 'Add cards to this set before assigning it.'
      : formError === 'no-test-types'
        ? 'Choose at least one question type.'
        : !hasSsoClass
          ? 'Choose at least one ClassLink class.'
          : undefined;

  const toggleTestType = (type: FlashcardTestType, checked: boolean): void =>
    update({
      testTypes: checked
        ? [...form.testTypes.filter((t) => t !== type), type]
        : form.testTypes.filter((t) => t !== type),
    });

  const countOptions = flashcardTestCountOptions(cardCount);
  const testCount = countOptions.includes(form.testCount)
    ? form.testCount
    : 'all';

  const extraSlot = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-black text-slate-800">
            Collect a submission
          </span>
          <Toggle
            size="sm"
            label="Collect a submission"
            anchor={tourAttr('flashcards-assign.collect')}
            checked={form.collectSubmission}
            onChange={(checked) => update({ collectSubmission: checked })}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {form.collectSubmission
            ? 'Check: students complete one mode with your settings and submit once. Their work then locks.'
            : 'Study: students can use every mode. Progress is tracked until the close date, if you set one.'}
        </p>
      </div>

      {form.collectSubmission && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Segmented
            name="flashcard-assign-mode"
            label="Mode"
            options={MODE_OPTIONS}
            value={form.checkMode}
            onChange={(checkMode) => update({ checkMode })}
          />
          <Segmented
            name="flashcard-assign-show-first"
            label="Show first"
            options={SIDE_OPTIONS}
            value={form.showFirst}
            onChange={(showFirst) => update({ showFirst })}
          />

          {form.checkMode !== 'flashcards' && (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-700">Strict mode</p>
                <p className="text-xs text-slate-500">
                  Require exact spelling, accents, and articles.
                </p>
              </div>
              <Toggle
                size="sm"
                label="Strict mode"
                anchor={tourAttr('flashcards-assign.strict')}
                checked={form.strict}
                onChange={(strict) => update({ strict })}
              />
            </div>
          )}

          {form.checkMode === 'test' && (
            <>
              <fieldset>
                <legend className={LABEL_CLASS}>Question types</legend>
                <div className="space-y-1.5">
                  {TEST_TYPE_OPTIONS.map((option) => {
                    const disabled = option.value === 'mc' && !mcAvailable;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2 text-sm font-bold ${
                          disabled
                            ? 'cursor-not-allowed text-slate-400'
                            : 'cursor-pointer text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 accent-brand-blue-primary"
                          disabled={disabled}
                          {...tourFieldAttr(
                            'flashcards-assign.test-type',
                            'assign',
                            option.value
                          )}
                          checked={
                            !disabled && form.testTypes.includes(option.value)
                          }
                          onChange={(event) =>
                            toggleTestType(option.value, event.target.checked)
                          }
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                {!mcAvailable && (
                  <p className="mt-1 text-xs text-slate-500">
                    Multiple choice needs at least 4 cards.
                  </p>
                )}
                {formError === 'no-test-types' && (
                  <p
                    role="alert"
                    className="mt-1 text-xs font-bold text-rose-600"
                  >
                    Choose at least one question type.
                  </p>
                )}
              </fieldset>
              <div>
                <label
                  htmlFor="flashcard-assign-test-count"
                  className={LABEL_CLASS}
                >
                  Questions
                </label>
                <select
                  id="flashcard-assign-test-count"
                  {...tourAttr('flashcards-assign.questions')}
                  value={String(testCount)}
                  onChange={(event) =>
                    update({
                      testCount:
                        event.target.value === 'all'
                          ? 'all'
                          : Number(event.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                >
                  {countOptions.map((count) => (
                    <option key={String(count)} value={String(count)}>
                      {count === 'all' ? `All (${cardCount})` : count}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {form.checkMode === 'flashcards' && (
            <div>
              <Segmented
                name="flashcard-assign-threshold"
                label="Mastery threshold"
                options={THRESHOLD_OPTIONS}
                value={form.masteryThreshold}
                onChange={(masteryThreshold) => update({ masteryThreshold })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Correct answers in a row before a card counts as mastered.
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="flashcard-assign-score-visibility"
              className={LABEL_CLASS}
            >
              Score visibility
            </label>
            <select
              id="flashcard-assign-score-visibility"
              {...tourAttr('flashcards-assign.score-visibility')}
              value={form.scoreVisibility}
              onChange={(event) =>
                update({
                  scoreVisibility: event.target
                    .value as FlashcardScoreVisibility,
                })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            >
              {SCORE_VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <AssignClassPicker
        rosters={rosters}
        value={pickerValue}
        onChange={setPickerValue}
      />
      {!hasSsoClass && (
        <p className="text-xs text-slate-500">Choose at least one class.</p>
      )}
      <AssignTargetingSection
        rosters={rosters}
        selectedRosterIds={pickerValue.rosterIds}
        periodAccess={periodAccess}
        value={targetingValue}
        onChange={setTargetingValue}
        kind="flashcards"
        showDueAt
        availabilityEnabled={availabilityOn}
        workKind={workKindSetting}
      />
    </div>
  );

  return (
    <AssignModal<FlashcardAssignForm>
      isOpen={isOpen}
      onClose={onClose}
      itemTitle={set.title || 'Untitled set'}
      options={form}
      onOptionsChange={setForm}
      extraSlot={extraSlot}
      // Flashcards is opened maximized from the dashboard; the default
      // z-modal (10000) sits below a maximized widget (z-maximized, 10500),
      // so the modal renders invisibly behind it. Same fix as
      // SpotifyPremiumDialog.tsx.
      zIndex="z-dialog"
      onAssign={async () => {
        await onAssign(
          buildFlashcardAssignSubmission({
            set,
            form,
            rosters,
            rosterIds: pickerValue.rosterIds,
            targeting: applyAvailability(targetingValue, {
              enabled: availabilityOn,
              rosters: rosters.filter(
                (r) => !r.loadError && pickerValue.rosterIds.includes(r.id)
              ),
              bellWindow: periodAccess?.bellWindow,
              workKind: workKindSetting,
            }).targeting,
            bellWindow: periodAccess?.bellWindow,
          })
        );
      }}
      confirmLabel="Assign"
      confirmDisabled={disabledReason !== undefined}
      confirmDisabledReason={disabledReason}
    />
  );
};
