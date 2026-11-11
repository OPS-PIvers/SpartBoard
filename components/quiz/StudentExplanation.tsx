import React from 'react';
import type { RevealedExplanations } from '@/types';

interface StudentExplanationProps {
  entry: RevealedExplanations[string] | undefined;
  light?: boolean;
}

/** The teacher's explanation under a question in published results. */
export const StudentExplanation: React.FC<StudentExplanationProps> = ({
  entry,
  light = false,
}) => {
  const options = Object.entries(entry?.options ?? {});
  if (!entry?.explanation && options.length === 0) return null;
  const card = light
    ? 'border-brand-blue-primary/20 bg-brand-blue-lighter text-slate-800'
    : 'border-slate-600 bg-slate-800/60 text-slate-100';
  const heading = light ? 'text-brand-blue-primary' : 'text-slate-300';
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${card}`}>
      <p
        className={`mb-1 text-[10px] font-black uppercase tracking-wider ${heading}`}
      >
        Explanation
      </p>
      {entry?.explanation && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {entry.explanation}
        </p>
      )}
      {options.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-sm leading-relaxed">
          {options.map(([option, text]) => (
            <li key={option}>
              <span className="font-semibold">{option}:</span> {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
