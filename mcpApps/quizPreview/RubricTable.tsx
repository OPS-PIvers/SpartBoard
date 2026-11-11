// A rubric as a criteria-by-levels grid, highest level first, matching the app's rubric builder.
import React from 'react';
import type { RubricCardView } from './types';

export const RubricTable: React.FC<{ rubric: RubricCardView }> = ({
  rubric,
}) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="w-full border-collapse text-left text-xs">
      <tbody>
        {rubric.criteria.map((c, i) => {
          const levels = [...c.levels].sort((a, b) => b.points - a.points);
          return (
            <tr
              key={`${c.name}-${i}`}
              className="border-b border-slate-200 last:border-b-0"
            >
              <th
                scope="row"
                className="w-1/4 min-w-[140px] border-r border-slate-200 bg-slate-50 p-2.5 align-top"
              >
                <div className="text-sm font-bold text-slate-800">{c.name}</div>
                <div className="font-semibold text-slate-500">
                  {levels[0]?.points ?? 0} pts
                </div>
                {c.description && (
                  <div className="mt-1 font-normal text-slate-500">
                    {c.description}
                  </div>
                )}
              </th>
              {levels.map((l, j) => (
                <td
                  key={`${l.label}-${j}`}
                  className="min-w-[120px] border-r border-slate-200 p-2.5 align-top last:border-r-0"
                >
                  <div className="font-bold text-slate-800">
                    {l.label} · {l.points}
                  </div>
                  {l.description && (
                    <div className="mt-1 text-slate-500">{l.description}</div>
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
