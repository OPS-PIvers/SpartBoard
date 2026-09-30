import React from 'react';
import type { ProficiencyScale } from '@/utils/gradebook/gradebookCore';
import { bandRanges } from './bands';

export const BandLegend: React.FC<{ scale: ProficiencyScale }> = ({
  scale,
}) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
    {bandRanges(scale).map(({ style, range }) => (
      <li key={style.level} className="inline-flex items-center gap-1.5">
        <span aria-hidden className={`w-2.5 h-2.5 rounded-sm ${style.bar}`} />
        <span className="font-semibold text-slate-700">{style.name}</span>
        <span>{range}</span>
      </li>
    ))}
  </ul>
);
