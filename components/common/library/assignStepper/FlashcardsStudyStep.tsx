// Study settings step for a Flashcards study resource: what students start with, locked or not.
import React from 'react';
import type { FlashcardStudySettings, FlashcardTestType } from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { isMcAvailable } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  FLASHCARD_SIDE_OPTIONS,
  FLASHCARD_TEST_TYPE_OPTIONS,
} from '@/components/widgets/Flashcards/utils/flashcardAssignOptions';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface FlashcardsStudyStepProps {
  value: FlashcardStudySettings;
  onChange: (value: FlashcardStudySettings) => void;
  cardCount: number;
}

const ROW_CLASS = 'flex min-h-8 items-center justify-between gap-3';
const LABEL_CLASS = 'text-sm font-bold text-brand-blue-dark';
const SUB_LABEL_CLASS = 'text-sm font-medium text-slate-700';

export const FlashcardsStudyStep: React.FC<FlashcardsStudyStepProps> = ({
  value,
  onChange,
  cardCount,
}) => {
  const update = (patch: Partial<FlashcardStudySettings>): void =>
    onChange({ ...value, ...patch });
  const mcAvailable = isMcAvailable(cardCount);
  const toggleTestType = (type: FlashcardTestType, on: boolean): void => {
    const next = on
      ? [...value.testTypes.filter((t) => t !== type), type]
      : value.testTypes.filter((t) => t !== type);
    // The player always keeps one question type.
    if (next.length > 0) update({ testTypes: next });
  };

  return (
    <div className="space-y-3">
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>Show first</span>
        <SegmentedControl
          role="radiogroup"
          ariaLabel="Show first"
          anchor={tourAttr('flashcards-study.show-first')}
          options={FLASHCARD_SIDE_OPTIONS}
          value={value.showFirst}
          onChange={(showFirst) => update({ showFirst })}
        />
      </div>
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>Shuffle</span>
        <Toggle
          size="sm"
          label="Shuffle"
          anchor={tourAttr('flashcards-study.shuffle')}
          checked={value.shuffle}
          onChange={(shuffle) => update({ shuffle })}
        />
      </div>
      <div
        className={ROW_CLASS}
        title="Write and Test require exact spelling, accents, and articles."
      >
        <span className={LABEL_CLASS}>Strict mode</span>
        <Toggle
          size="sm"
          label="Strict mode"
          anchor={tourAttr('flashcards-study.strict')}
          checked={value.strict}
          onChange={(strict) => update({ strict })}
        />
      </div>
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>Test question types</span>
      </div>
      <div className="ml-1 space-y-1.5 border-l-2 border-slate-100 pl-3">
        {FLASHCARD_TEST_TYPE_OPTIONS.map((option) => {
          const disabled = option.value === 'mc' && !mcAvailable;
          const checked = !disabled && value.testTypes.includes(option.value);
          const onlyOne =
            checked &&
            value.testTypes.filter((t) => t !== 'mc' || mcAvailable).length ===
              1;
          return (
            <div
              key={option.value}
              className={ROW_CLASS}
              title={
                disabled ? 'Multiple choice needs at least 4 cards.' : undefined
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
                disabled={disabled || onlyOne}
                anchor={tourFieldAttr(
                  'flashcards-study.test-type',
                  'assign',
                  option.value
                )}
                checked={checked}
                onChange={(on) => toggleTestType(option.value, on)}
              />
            </div>
          );
        })}
      </div>
      <div className={`${ROW_CLASS} border-t border-slate-100 pt-3`}>
        <span className={LABEL_CLASS}>Lock study settings</span>
        <Toggle
          size="sm"
          label="Lock study settings"
          anchor={tourAttr('flashcards-study.lock')}
          checked={value.locked}
          onChange={(locked) => update({ locked })}
        />
      </div>
    </div>
  );
};
