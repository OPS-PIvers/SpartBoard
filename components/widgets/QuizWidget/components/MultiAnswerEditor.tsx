import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { inputClass } from './quizEditorFieldStyles';

const MAX_OPTIONS_PER_LIST = 6;

interface MultiAnswerEditorProps {
  correctAnswer: string;
  incorrectAnswers: string[];
  onChange: (updates: {
    correctAnswer?: string;
    incorrectAnswers?: string[];
  }) => void;
}

// `|` separates stored options, so it can never appear inside one.
const clean = (value: string) => value.replace(/\|/g, '');

interface OptionListProps {
  label: string;
  labelClassName: string;
  itemLabel: string;
  items: string[];
  minItems: number;
  inputClassName: string;
  onItemsChange: (items: string[]) => void;
}

const OptionList: React.FC<OptionListProps> = ({
  label,
  labelClassName,
  itemLabel,
  items,
  minItems,
  inputClassName,
  onItemsChange,
}) => (
  <div className="space-y-2">
    <label className={labelClassName}>{label}</label>
    <div className="grid gap-2">
      {items.map((value, idx) => (
        <div key={idx} className="flex gap-2">
          <input
            type="text"
            value={value}
            aria-label={`${itemLabel} ${idx + 1}`}
            placeholder={`${itemLabel} ${idx + 1}`}
            onChange={(e) =>
              onItemsChange(
                items.map((v, i) => (i === idx ? clean(e.target.value) : v))
              )
            }
            className={inputClassName}
          />
          {items.length > minItems && (
            <button
              onClick={() => onItemsChange(items.filter((_, i) => i !== idx))}
              className="px-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              aria-label={`Remove ${itemLabel.toLowerCase()} ${idx + 1}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {items.length < MAX_OPTIONS_PER_LIST && (
        <button
          onClick={() => onItemsChange([...items, ''])}
          className="flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-300 hover:border-brand-blue-primary/40 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-brand-blue-primary font-bold transition-all text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Add {itemLabel}
        </button>
      )}
    </div>
  </div>
);

export const MultiAnswerEditor: React.FC<MultiAnswerEditorProps> = ({
  correctAnswer,
  incorrectAnswers,
  onChange,
}) => {
  // Blank rows survive the round trip: '' splits to [''] and 'A|' to ['A', ''].
  const correct = correctAnswer.split('|');
  return (
    <div className="space-y-4">
      <OptionList
        label="Correct Options"
        labelClassName="block font-bold text-emerald-700 mb-1 text-xs uppercase tracking-wider"
        itemLabel="Correct option"
        items={correct}
        minItems={1}
        inputClassName="w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 text-sm"
        onItemsChange={(items) => onChange({ correctAnswer: items.join('|') })}
      />
      <OptionList
        label="Incorrect Options"
        labelClassName="block font-bold text-slate-600 mb-1 text-xs uppercase tracking-wider"
        itemLabel="Incorrect option"
        items={incorrectAnswers}
        minItems={1}
        inputClassName={inputClass}
        onItemsChange={(items) => onChange({ incorrectAnswers: items })}
      />
    </div>
  );
};

/** FIB: other answers also marked correct. */
export const AlternateAnswersEditor: React.FC<{
  alternates: string[];
  onChange: (next: string[]) => void;
}> = ({ alternates, onChange }) => (
  <div className="mt-3">
    <OptionList
      label="Also Accept (optional)"
      labelClassName="block font-bold text-slate-600 mb-1 text-xs uppercase tracking-wider"
      itemLabel="Accepted answer"
      items={alternates}
      minItems={0}
      inputClassName={inputClass}
      onItemsChange={onChange}
    />
  </div>
);
