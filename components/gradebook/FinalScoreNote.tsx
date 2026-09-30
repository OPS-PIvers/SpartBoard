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

/** The line under a Results score: gradebook flags and the struck calculated score an override replaced. */
export const FinalScoreNote: React.FC<FinalScoreNoteProps> = ({
  final,
  flagDefs,
  className = 'text-slate-500',
}) => {
  const names = final.flags
    .map((f) => flagDefs.find((d) => d.id === f.id)?.name)
    .filter((n): n is string => !!n);
  if (final.status === 'excluded' && !names.length) names.push('Excused');
  const calculated =
    final.source === 'override' &&
    final.rawPoints !== null &&
    final.max !== null &&
    final.max > 0
      ? Math.round((final.rawPoints / final.max) * 100)
      : null;
  if (!names.length && calculated === null) return null;
  return (
    <p
      data-testid="final-score-note"
      className={`tabular-nums ${className}`}
      style={{ fontSize: 'min(10px, 3cqmin)' }}
    >
      {names.join(', ')}
      {names.length > 0 && calculated !== null && ' '}
      {calculated !== null && <s>Calculated {calculated}%</s>}
    </p>
  );
};
