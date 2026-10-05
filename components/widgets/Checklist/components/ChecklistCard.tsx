import React from 'react';
import { Circle, CheckCircle2 } from 'lucide-react';
import { hexToRgba } from '@/utils/styles';

interface ChecklistCardProps {
  id: string;
  label: string;
  isCompleted: boolean;
  onToggle: (id: string) => void;
  textSize: string;
  iconSize: string;
  cardPadding: string;
  cardGap: string;
  cardColor: string;
  cardOpacity: number;
  fontColor: string;
  lines?: boolean;
  first?: boolean;
}

export const ChecklistCard = React.memo<ChecklistCardProps>(
  ({
    id,
    label,
    isCompleted,
    onToggle,
    textSize,
    iconSize,
    cardPadding,
    cardGap,
    cardColor,
    cardOpacity,
    fontColor,
    lines = false,
    first = false,
  }) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === ' ') e.preventDefault();
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        onToggle(id);
      }
    };

    // Use the user-selected card color. Completed items get a neutral gray tint.
    const bgColor = isCompleted
      ? hexToRgba('#cbd5e1', cardOpacity) // slate-300
      : hexToRgba(cardColor, cardOpacity);

    const borderColor = hexToRgba('#e2e8f0', cardOpacity); // slate-200

    return (
      <div
        role="checkbox"
        aria-checked={isCompleted}
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={handleKeyDown}
        className={`w-full h-full flex items-center cursor-pointer select-none transition-all overflow-hidden ${lines ? '' : 'rounded-2xl border shadow-sm active:scale-[0.98]'}`}
        style={
          lines
            ? {
                gap: cardGap,
                padding: cardPadding,
                borderTop: first
                  ? undefined
                  : `1px solid color-mix(in srgb, ${fontColor} 14%, transparent)`,
              }
            : {
                gap: cardGap,
                padding: cardPadding,
                backgroundColor: bgColor,
                borderColor: isCompleted
                  ? hexToRgba('#e2e8f0', cardOpacity * 0.5)
                  : borderColor,
              }
        }
      >
        <div className="shrink-0 transition-transform active:scale-90">
          {isCompleted ? (
            <CheckCircle2
              className="text-green-500"
              style={{ width: iconSize, height: iconSize }}
            />
          ) : (
            <Circle
              className="text-indigo-300"
              style={{ width: iconSize, height: iconSize }}
            />
          )}
        </div>
        <span
          className={`font-bold leading-snug min-w-0 flex-1 text-left transition-all`}
          style={{
            fontSize: textSize,
            color: isCompleted ? '#94a3b8' : fontColor,
            textDecoration: isCompleted ? 'line-through' : 'none',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {label}
        </span>
      </div>
    );
  }
);
ChecklistCard.displayName = 'ChecklistCard';
