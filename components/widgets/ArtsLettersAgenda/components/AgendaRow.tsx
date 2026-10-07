import React, { useId } from 'react';
import { Check } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
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
    const checkboxId = useId();
    const textClass = isDone ? 'text-slate-500 line-through' : '';
    const textStyle = isDone ? undefined : { color: fontColor };

    return (
      <div
        className="w-full h-full flex items-center"
        style={{ gap: 'clamp(6px, 3cqw, 16px)' }}
      >
        <IconButton
          id={checkboxId}
          role="checkbox"
          aria-checked={isDone}
          label={`${label} done`}
          variant="glass"
          shape="square"
          onClick={() => onToggle(id)}
          className={`shrink-0 !p-0 active:scale-90 ${
            isDone
              ? 'bg-green-500 shadow-sm hover:!bg-green-600'
              : 'border-2 border-slate-400 bg-white/70 hover:border-green-500'
          }`}
          style={{ width: boxSize, height: boxSize }}
          icon={
            <Check
              aria-hidden
              strokeWidth={3.5}
              className={isDone ? 'text-white' : 'opacity-0'}
              style={{ width: '72%', height: '72%' }}
            />
          }
        />
        <div
          className="flex-1 min-w-0 h-full flex flex-col justify-center rounded-2xl border border-slate-300/70 shadow-sm overflow-hidden transition-colors"
          style={{
            backgroundColor: hexToRgba(cardColor, cardOpacity),
            padding: 'clamp(2px, 4cqh, 14px) clamp(8px, 3.5cqw, 20px)',
          }}
        >
          <label
            htmlFor={checkboxId}
            className={`font-bold leading-none truncate cursor-pointer select-none ${textClass}`}
            style={{ fontSize: titleSize, ...textStyle }}
          >
            {label}
          </label>
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
            className={`w-full flex-1 min-h-0 resize-none bg-transparent italic leading-tight outline-none overflow-hidden rounded placeholder:opacity-0 hover:placeholder:opacity-50 focus:placeholder:opacity-50 focus:bg-white/40 [@container(max-height:48px)]:hidden ${textClass}`}
            placeholder="Add details"
            style={{ fontSize: descSize, ...textStyle }}
          />
        </div>
      </div>
    );
  }
);
AgendaRow.displayName = 'AgendaRow';
