import React from 'react';
import type {
  FinalScore,
  GradebookFlagDef,
} from '@/utils/gradebook/gradebookCore';

interface FinalScoreNoteProps {
  final: FinalScore;
  flagDefs: GradebookFlagDef[];
  className?: string;
}

// Same chip classes as the gradebook grid; auto flags are outlined (D15).
const FLAG_CHIP: Record<string, { solid: string; auto: string }> = {
  rose: {
    solid: 'bg-brand-red-primary text-white',
    auto: 'bg-white text-brand-red-primary ring-brand-red-primary',
  },
  amber: {
    solid: 'bg-amber-600 text-white',
    auto: 'bg-white text-amber-700 ring-amber-600',
  },
  orange: {
    solid: 'bg-orange-600 text-white',
    auto: 'bg-white text-orange-700 ring-orange-600',
  },
  emerald: {
    solid: 'bg-emerald-600 text-white',
    auto: 'bg-white text-emerald-700 ring-emerald-600',
  },
  teal: {
    solid: 'bg-teal-600 text-white',
    auto: 'bg-white text-teal-700 ring-teal-600',
  },
  sky: {
    solid: 'bg-sky-600 text-white',
    auto: 'bg-white text-sky-700 ring-sky-600',
  },
  blue: {
    solid: 'bg-brand-blue-primary text-white',
    auto: 'bg-white text-brand-blue-primary ring-brand-blue-primary',
  },
  slate: {
    solid: 'bg-slate-500 text-white',
    auto: 'bg-white text-slate-600 ring-slate-500',
  },
};

function chipClasses(color: string, auto: boolean): string {
  const c = FLAG_CHIP[color] ?? FLAG_CHIP.slate;
  return auto ? `ring-[1.5px] ring-inset ${c.auto}` : c.solid;
}

/** The line under a Results score, worded like the gradebook cell popover: flags, then the calculated score an override replaced. */
export const FinalScoreNote: React.FC<FinalScoreNoteProps> = ({
  final,
  flagDefs,
  className = 'text-slate-500',
}) => {
  const flags = final.flags
    .map((f) => ({ auto: f.auto, def: flagDefs.find((d) => d.id === f.id) }))
    .filter(
      (f): f is { auto: boolean; def: GradebookFlagDef } => f.def !== undefined
    );
  const calculated =
    final.source === 'override' &&
    final.rawPoints !== null &&
    final.max !== null &&
    final.max > 0
      ? `${Math.round((final.rawPoints / final.max) * 100)}%`
      : final.source === 'override'
        ? 'none'
        : null;
  if (!flags.length && calculated === null) return null;
  return (
    <p
      data-testid="final-score-note"
      className={`flex flex-wrap items-center justify-end tabular-nums ${className}`}
      style={{ fontSize: 'min(10px, 3cqmin)', gap: 'min(4px, 1cqmin)' }}
    >
      {flags.map(({ auto, def }) => (
        <span key={def.id} className="inline-flex items-center gap-1">
          <i
            className={`not-italic grid h-4 min-w-4 place-items-center rounded px-[3px] text-[9.5px] font-bold leading-none ${chipClasses(def.color, auto)}`}
            aria-hidden
          >
            {def.key}
          </i>
          {def.name}
        </span>
      ))}
      {calculated !== null && (
        <span>
          Calculated <s className="text-slate-400">{calculated}</s>
        </span>
      )}
    </p>
  );
};
