import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { QuestionTargetTag } from '@/types';
import { TargetPicker } from './TargetPicker';

interface TargetsFieldProps {
  targets: QuestionTargetTag[] | undefined;
  /** Receives undefined when the last tag is removed, so untagged items stay free of the key. */
  onChange: (targets: QuestionTargetTag[] | undefined) => void;
  labelClassName: string;
  label?: string;
}

const targetsSummary = (targets: readonly QuestionTargetTag[]): string =>
  targets.map((t) => t.code ?? t.label).join(', ');

/** Learning-target tags for one question: a select-style button that opens the shared picker. */
export const TargetsField: React.FC<TargetsFieldProps> = ({
  targets,
  onChange,
  labelClassName,
  label = 'Learning targets',
}) => {
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tags = targets ?? [];

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen(true)}
        title={tags.map((t) => t.label).join('\n') || undefined}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-800 hover:border-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
      >
        <span
          className={`min-w-0 flex-1 truncate ${tags.length ? '' : 'text-slate-400'}`}
        >
          {tags.length ? targetsSummary(tags) : 'None'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
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
