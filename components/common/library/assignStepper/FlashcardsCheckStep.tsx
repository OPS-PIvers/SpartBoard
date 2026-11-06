import React from 'react';
import type {
  FlashcardMasteryThreshold,
  FlashcardScoreVisibility,
  FlashcardTestType,
} from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import {
  flashcardTestCountOptions,
  isMcAvailable,
} from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  FLASHCARD_MODE_OPTIONS,
  FLASHCARD_SCORE_VISIBILITY_OPTIONS,
  FLASHCARD_SIDE_OPTIONS,
  FLASHCARD_TEST_TYPE_OPTIONS,
} from '@/components/widgets/Flashcards/utils/flashcardAssignOptions';
import type { FlashcardsCheckValue } from './flashcardsCheckValue';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface FlashcardsCheckContext {
  cardCount: number;
  /** flashcards-assign-v2: Cards and What students see own count and scores; Speak is a mode. */
  v2?: boolean;
  /** v2: Speak is available for this set (flag and language). */
  speakAvailable?: boolean;
}

export interface FlashcardsCheckStepProps extends FlashcardsCheckContext {
  value: FlashcardsCheckValue;
  onChange: (value: FlashcardsCheckValue) => void;
  /** Speak mode's Level, attempts, Strict and Hear it controls. */
  speakRules?: React.ReactNode;
}

const MASTERY_MIN = 2;
const MASTERY_MAX = 4;

const ROW_CLASS = 'flex min-h-8 items-center justify-between gap-3';
const LABEL_CLASS = 'text-sm font-bold text-brand-blue-dark';
const SUB_LABEL_CLASS = 'text-sm font-medium text-slate-700';
const SELECT_CLASS =
  'h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-hidden';

const parseMastery = (raw: string): FlashcardMasteryThreshold | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= MASTERY_MIN && n <= MASTERY_MAX
    ? (n as FlashcardMasteryThreshold)
    : null;
};

export const FlashcardsCheckStep: React.FC<FlashcardsCheckStepProps> = ({
  value,
  onChange,
  cardCount,
  v2 = false,
  speakAvailable = false,
  speakRules,
}) => {
  const update = (patch: Partial<FlashcardsCheckValue>): void =>
    onChange({ ...value, ...patch });
  const mcAvailable = isMcAvailable(cardCount);
  const countOptions = flashcardTestCountOptions(cardCount);
  const testCount = countOptions.includes(value.testCount)
    ? value.testCount
    : 'all';
  const toggleTestType = (type: FlashcardTestType, on: boolean): void =>
    update({
      testTypes: on
        ? [...value.testTypes.filter((t) => t !== type), type]
        : value.testTypes.filter((t) => t !== type),
    });
  const modeOptions =
    v2 && speakAvailable
      ? [...FLASHCARD_MODE_OPTIONS, { value: 'speak' as const, label: 'Speak' }]
      : FLASHCARD_MODE_OPTIONS;
  const speakMode = value.checkMode === 'speak';
  const noTestTypes =
    value.checkMode === 'test' &&
    !value.testTypes.some((type) => type !== 'mc' || mcAvailable);

  return (
    <div className="space-y-3">
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>Mode</span>
        <SegmentedControl
          role="radiogroup"
          ariaLabel="Mode"
          anchor={tourAttr('flashcards-check.mode')}
          options={modeOptions}
          value={value.checkMode}
          onChange={(checkMode) => update({ checkMode })}
        />
      </div>
      {speakMode && speakRules}
      {speakMode && !speakRules && (
        <p className="text-sm text-slate-600">
          Students say each term aloud. Attempts per card come from this
          set&rsquo;s Speak settings.
        </p>
      )}
      {!speakMode && (
        <div className={ROW_CLASS}>
          <span className={LABEL_CLASS}>Show first</span>
          <SegmentedControl
            role="radiogroup"
            ariaLabel="Show first"
            anchor={tourAttr('flashcards-check.show-first')}
            options={FLASHCARD_SIDE_OPTIONS}
            value={value.showFirst}
            onChange={(showFirst) => update({ showFirst })}
          />
        </div>
      )}

      {value.checkMode !== 'flashcards' && !speakMode && (
        <div className={ROW_CLASS}>
          <span className={LABEL_CLASS}>Strict mode</span>
          <Toggle
            size="sm"
            label="Strict mode"
            anchor={tourAttr('flashcards-check.strict')}
            checked={value.strict}
            onChange={(strict) => update({ strict })}
          />
        </div>
      )}

      {value.checkMode === 'test' && (
        <>
          <div className={ROW_CLASS}>
            <span className={LABEL_CLASS}>Question types</span>
          </div>
          <div className="ml-1 space-y-1.5 border-l-2 border-slate-100 pl-3">
            {FLASHCARD_TEST_TYPE_OPTIONS.map((option) => {
              const disabled = option.value === 'mc' && !mcAvailable;
              return (
                <div
                  key={option.value}
                  className={ROW_CLASS}
                  title={
                    disabled
                      ? 'Multiple choice needs at least 4 cards.'
                      : undefined
                  }
                >
                  <span
                    className={
                      disabled
                        ? 'text-sm font-medium text-slate-400'
                        : SUB_LABEL_CLASS
                    }
                  >
                    {option.label}
                  </span>
                  <Toggle
                    size="sm"
                    label={option.label}
                    disabled={disabled}
                    anchor={tourFieldAttr(
                      'flashcards-check.test-type',
                      'assign',
                      option.value
                    )}
                    checked={
                      !disabled && value.testTypes.includes(option.value)
                    }
                    onChange={(on) => toggleTestType(option.value, on)}
                  />
                </div>
              );
            })}
            {noTestTypes && (
              <p role="alert" className="text-xs font-bold text-rose-600">
                Choose at least one question type.
              </p>
            )}
          </div>
          {!v2 && (
            <div className={ROW_CLASS}>
              <label htmlFor="flashcards-check-count" className={LABEL_CLASS}>
                Questions
              </label>
              <select
                id="flashcards-check-count"
                {...tourAttr('flashcards-check.questions')}
                value={String(testCount)}
                onChange={(event) =>
                  update({
                    testCount:
                      event.target.value === 'all'
                        ? 'all'
                        : Number(event.target.value),
                  })
                }
                className={`${SELECT_CLASS} w-28`}
              >
                {countOptions.map((count) => (
                  <option key={String(count)} value={String(count)}>
                    {count === 'all' ? `All (${cardCount})` : count}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {value.checkMode === 'flashcards' && (
        <div
          className={ROW_CLASS}
          title="Correct answers in a row before a card counts as mastered"
        >
          <label htmlFor="flashcards-check-mastery" className={LABEL_CLASS}>
            Correct in a row to master
          </label>
          <input
            id="flashcards-check-mastery"
            {...tourAttr('flashcards-check.mastery')}
            type="number"
            min={MASTERY_MIN}
            max={MASTERY_MAX}
            step={1}
            value={value.masteryThreshold}
            onChange={(event) => {
              const masteryThreshold = parseMastery(event.target.value);
              if (masteryThreshold !== null) update({ masteryThreshold });
            }}
            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
          />
        </div>
      )}

      {!v2 && (
        <div className={ROW_CLASS}>
          <label
            htmlFor="flashcards-check-score-visibility"
            className={LABEL_CLASS}
          >
            Score visibility
          </label>
          <select
            id="flashcards-check-score-visibility"
            {...tourAttr('flashcards-check.score-visibility')}
            value={value.scoreVisibility}
            onChange={(event) =>
              update({
                scoreVisibility: event.target.value as FlashcardScoreVisibility,
              })
            }
            className={`${SELECT_CLASS} w-56`}
          >
            {FLASHCARD_SCORE_VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

/** v2's What students see step: the score visibility choice on its own. */
export const FlashcardsFeedbackStep: React.FC<{
  value: FlashcardsCheckValue;
  onChange: (value: FlashcardsCheckValue) => void;
}> = ({ value, onChange }) => (
  <div className={ROW_CLASS}>
    <label htmlFor="flashcards-check-score-visibility" className={LABEL_CLASS}>
      Score visibility
    </label>
    <select
      id="flashcards-check-score-visibility"
      {...tourAttr('flashcards-check.score-visibility')}
      value={value.scoreVisibility}
      onChange={(event) =>
        onChange({
          ...value,
          scoreVisibility: event.target.value as FlashcardScoreVisibility,
        })
      }
      className={`${SELECT_CLASS} w-56`}
    >
      {FLASHCARD_SCORE_VISIBILITY_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);
