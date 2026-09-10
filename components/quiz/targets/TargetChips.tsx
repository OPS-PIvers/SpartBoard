import React from 'react';
import { X } from 'lucide-react';
import type { QuestionTargetTag } from '@/types';

const KIND_CLASS: Record<QuestionTargetTag['kind'], string> = {
  standard: 'bg-sky-50 text-sky-800 border-sky-200',
  plc: 'bg-violet-50 text-violet-800 border-violet-200',
  personal: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const tagDisplay = (tag: QuestionTargetTag): string => tag.code ?? tag.label;

interface TargetChipsProps {
  targets: QuestionTargetTag[];
  onRemove?: (id: string) => void;
  /** Bank-inherited tags: rendered dimmed and without a remove button. */
  muted?: boolean;
  /** Compact chips for list rows (code only, capped). */
  compact?: boolean;
  max?: number;
}

export const TargetChips: React.FC<TargetChipsProps> = ({
  targets,
  onRemove,
  muted = false,
  compact = false,
  max,
}) => {
  if (targets.length === 0) return null;
  const shown = max ? targets.slice(0, max) : targets;
  const overflow = targets.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <span
          key={tag.id}
          title={tag.code ? `${tag.code} — ${tag.label}` : tag.label}
          className={`inline-flex items-center gap-1 rounded border font-semibold ${
            compact ? 'px-1 py-px text-xxs' : 'px-1.5 py-0.5 text-xs'
          } ${KIND_CLASS[tag.kind]} ${muted ? 'opacity-60' : ''}`}
        >
          <span
            className={compact ? 'max-w-[7rem] truncate' : 'max-w-xs truncate'}
          >
            {compact
              ? tagDisplay(tag)
              : tag.code
                ? `${tag.code} ${tag.label}`
                : tag.label}
          </span>
          {onRemove && !muted && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tag.id);
              }}
              aria-label={`Remove ${tagDisplay(tag)}`}
              className="rounded hover:bg-black/10 p-px"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xxs font-semibold text-slate-500">
          +{overflow}
        </span>
      )}
    </span>
  );
};
