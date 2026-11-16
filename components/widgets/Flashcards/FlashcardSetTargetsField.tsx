import React, { useId, useState } from 'react';
import type { QuestionTargetTag } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { TargetsField } from '@/components/quiz/targets/TargetsField';
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
  labelClassName?: string;
}

const MetaTargetsRow: React.FC<
  Pick<FlashcardSetTargetsFieldProps, 'targets' | 'onChange'>
> = ({ targets, onChange }) => {
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tags = targets ?? [];
  return (
    <div className="border-y border-slate-200 py-1">
      <MetaItem label="Learning targets" htmlFor={id}>
        <button
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(true)}
          title={tags.map((t) => t.label).join('\n') || undefined}
          className={`${metaValueClass} max-w-full`}
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
    </div>
  );
};

/** Set-level learning targets: Quiz's targets field and picker, applied to every card in the set. */
export const FlashcardSetTargetsField: React.FC<
  FlashcardSetTargetsFieldProps
> = ({
  targets,
  onChange,
  labelClassName = 'mb-1 block text-xxs font-black uppercase tracking-widest text-slate-500',
}) => {
  const { canAccessFeature } = useAuth();
  return canAccessFeature('question-editor-fields') ? (
    <MetaTargetsRow targets={targets} onChange={onChange} />
  ) : (
    <TargetsField
      targets={targets}
      onChange={onChange}
      labelClassName={labelClassName}
    />
  );
};
