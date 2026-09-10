import React, { useMemo } from 'react';
import type { QuestionTargetTag } from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import { bankTagCounts } from './bankSlotHelpers';

const KIND_CLASS: Record<QuestionTargetTag['kind'], string> = {
  standard: 'border-sky-300 bg-sky-50 text-sky-800',
  plc: 'border-violet-300 bg-violet-50 text-violet-800',
  personal: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

interface BankTargetFilterProps {
  bank: Pick<BankContent, 'questions' | 'targets'>;
  value: string[];
  onChange: (next: string[]) => void;
}

/** Toggle-chip multi-select over a bank's tags; empty selection = whole bank. */
export const BankTargetFilter: React.FC<BankTargetFilterProps> = ({
  bank,
  value,
  onChange,
}) => {
  const tags = useMemo(() => bankTagCounts(bank), [bank]);
  if (tags.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No learning targets in this bank. The slot draws from every question.
      </p>
    );
  }
  const selected = new Set(value);
  return (
    <div
      role="group"
      aria-label="Target filter"
      className="flex flex-wrap gap-1.5"
    >
      {tags.map(({ tag, count }) => {
        const on = selected.has(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            title={tag.code ? `${tag.code} — ${tag.label}` : tag.label}
            onClick={() =>
              onChange(
                on ? value.filter((id) => id !== tag.id) : [...value, tag.id]
              )
            }
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors ${
              on
                ? KIND_CLASS[tag.kind]
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            <span className="max-w-[10rem] truncate">
              {tag.code ?? tag.label}
            </span>
            <span className="font-mono text-xxs text-slate-500">{count}</span>
          </button>
        );
      })}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="px-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Clear
        </button>
      )}
    </div>
  );
};
