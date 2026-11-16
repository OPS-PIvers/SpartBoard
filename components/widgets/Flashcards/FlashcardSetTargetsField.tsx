import React, { useId, useState } from 'react';
import type { QuestionTargetTag } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';
import {
  MetaChevron,
  MetaItem,
  metaValueClass,
} from '@/components/widgets/QuizWidget/components/QuestionFields';

interface FlashcardSetTargetsFieldProps {
  targets: QuestionTargetTag[] | undefined;
  /** Receives undefined when the last tag is removed, so an untagged set stays free of the key. */
  onChange: (targets: QuestionTargetTag[] | undefined) => void;
}

/** Set-level learning targets as a row of the Quiz-style metadata list, applied to every card. */
export const FlashcardSetTargetsField: React.FC<
  FlashcardSetTargetsFieldProps
> = ({ targets, onChange }) => {
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tags = targets ?? [];
  return (
    <>
      <MetaItem label="Learning targets" htmlFor={id}>
        <button
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(true)}
          title={tags.map((t) => t.label).join('\n') || undefined}
          className={`${metaValueClass} max-w-full px-2`}
          {...tourAttr('targets.field')}
        >
          <span
            className={`min-w-0 truncate ${tags.length ? '' : 'text-slate-400'}`}
          >
            {tags.length
              ? tags.map((t) => t.code ?? t.label).join(', ')
              : 'None'}
          </span>
          <MetaChevron />
        </button>
      </MetaItem>
      {pickerOpen && (
        <TargetPicker
          open
          initial={tags}
          onApply={(next) => {
            onChange(next.length ? next : undefined);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
};
