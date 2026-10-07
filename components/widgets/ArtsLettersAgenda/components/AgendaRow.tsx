import React from 'react';
import { Check } from 'lucide-react';
import { hexToRgba } from '@/utils/styles';
import type { ArtsLettersAgendaPartId } from '@/types';
import { DESCRIPTION_MAX_LENGTH } from '../constants';

interface AgendaRowProps {
  id: ArtsLettersAgendaPartId;
  label: string;
  description: string;
  isDone: boolean;
  onToggle: (id: ArtsLettersAgendaPartId) => void;
  onDescriptionCommit: (id: ArtsLettersAgendaPartId, text: string) => void;
  titleSize: string;
  descSize: string;
  boxSize: string;
  cardColor: string;
  cardOpacity: number;
  fontColor: string;
}

const DONE_TEXT = '#64748b';

export const AgendaRow = React.memo<AgendaRowProps>(
  ({
    id,
    label,
    description,
    isDone,
    onToggle,
    onDescriptionCommit,
    titleSize,
    descSize,
    boxSize,
    cardColor,
    cardOpacity,
    fontColor,
  }) => {
    const textColor = isDone ? DONE_TEXT : fontColor;
    const strike = isDone ? 'line-through' : 'none';

    return (
      <div
        className="w-full h-full flex items-center"
        style={{ gap: 'clamp(6px, 3cqw, 16px)' }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={`${label} done`}
          onClick={() => onToggle(id)}
          className={`shrink-0 flex items-center justify-center rounded-lg transition-all active:scale-90 ${
            isDone
              ? 'bg-green-500 text-white shadow-sm'
              : 'border-2 border-slate-400 bg-white/70 text-transparent hover:border-green-500'
          }`}
          style={{ width: boxSize, height: boxSize }}
        >
          <Check
            aria-hidden
            strokeWidth={3.5}
            style={{ width: '72%', height: '72%' }}
          />
        </button>
        <div
          className="flex-1 min-w-0 h-full flex flex-col justify-center rounded-2xl border shadow-sm overflow-hidden transition-colors"
          style={{
            backgroundColor: hexToRgba(cardColor, cardOpacity),
            borderColor: hexToRgba('#94a3b8', cardOpacity),
            padding: 'clamp(4px, 5cqh, 14px) clamp(8px, 3.5cqw, 20px)',
          }}
        >
          <button
            type="button"
            onClick={() => onToggle(id)}
            className="text-left font-bold leading-none truncate cursor-pointer select-none"
            style={{
              fontSize: titleSize,
              color: textColor,
              textDecoration: strike,
            }}
          >
            {label}
          </button>
          <textarea
            key={description}
            defaultValue={description}
            aria-label={`${label} details`}
            title="Add details"
            rows={1}
            maxLength={DESCRIPTION_MAX_LENGTH}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              if (next !== description) onDescriptionCommit(id, next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-full flex-1 min-h-0 resize-none bg-transparent italic leading-tight outline-none overflow-hidden placeholder:opacity-0 hover:placeholder:opacity-50 focus:placeholder:opacity-50 focus:bg-white/40 rounded"
            placeholder="Add details"
            style={{
              fontSize: descSize,
              color: textColor,
              textDecoration: strike,
            }}
          />
        </div>
      </div>
    );
  }
);
AgendaRow.displayName = 'AgendaRow';
