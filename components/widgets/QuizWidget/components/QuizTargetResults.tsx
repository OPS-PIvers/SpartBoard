import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';
import type { QuizResponse } from '@/types';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import {
  buildTargetGridCsv,
  type MasteryBand,
  type QuizTargetStats,
  type TargetStat,
} from '@/utils/quizTargetStats';

interface QuizTargetResultsProps {
  quizTitle: string;
  responses: QuizResponse[];
  stats: QuizTargetStats;
  resolveName: (response: QuizResponse) => string;
}

type SortState = { key: string; descending: boolean };

const BAND_BAR: Record<MasteryBand, string> = {
  proficient: 'bg-emerald-500',
  approaching: 'bg-amber-400',
  beginning: 'bg-brand-red-light',
};

const BAND_CELL: Record<MasteryBand, string> = {
  proficient: 'bg-emerald-50 text-emerald-800',
  approaching: 'bg-amber-50 text-amber-800',
  beginning: 'bg-red-50 text-red-700',
};

const displayTarget = (row: TargetStat): string =>
  row.target.code
    ? `${row.target.code} — ${row.target.label}`
    : row.target.label;

const LowSampleBadge: React.FC = () => (
  <span
    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-xxs font-bold text-amber-800"
    title="Fewer than 5 scored student-question pairs"
  >
    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
    Low sample
  </span>
);

const MasteryRow: React.FC<{ row: TargetStat }> = ({ row }) => {
  const [expanded, setExpanded] = useState(false);
  const percent = row.correctPercent;
  return (
    <div className="overflow-hidden rounded-lg border border-brand-gray-lighter bg-white">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${displayTarget(row)}`}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1">
          <TargetChips targets={[row.target]} compact />
          <span className="mt-1 block truncate text-xxs text-slate-500">
            {row.servedCount} served · {row.attempted} scored ·{' '}
            {row.questionIds.length} question
            {row.questionIds.length === 1 ? '' : 's'}
          </span>
        </span>
        {row.lowSample && <LowSampleBadge />}
        <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
          {percent === null ? '—' : `${percent}%`}
        </span>
        <span
          className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={
            percent === null ? 'Not scored yet' : `${percent}% mastery`
          }
        >
          <span
            className={`block h-full rounded-full ${row.band ? BAND_BAR[row.band] : 'bg-slate-300'}`}
            style={{ width: `${percent ?? 0}%` }}
          />
        </span>
      </button>
      {expanded && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/70">
          {row.questions.map((question) => (
            <li
              key={question.id}
              className="flex items-center gap-2 px-3 py-2 pl-9 text-xs text-slate-600"
            >
              <span className="shrink-0 font-mono font-bold text-brand-blue-primary">
                Q{question.index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{question.text}</span>
              {question.lowSample && <LowSampleBadge />}
              <span className="shrink-0 tabular-nums text-slate-500">
                {question.servedCount} served
              </span>
              <span className="w-10 shrink-0 text-right font-bold tabular-nums text-slate-700">
                {question.correctPercent === null
                  ? '—'
                  : `${question.correctPercent}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const QuizTargetResults: React.FC<QuizTargetResultsProps> = ({
  quizTitle,
  responses,
  stats,
  resolveName,
}) => {
  const columns = stats.targets.filter((row) => row.servedCount > 0);
  const standards = stats.standards.filter((row) => row.servedCount > 0);
  const [sort, setSort] = useState<SortState>({
    key: 'student',
    descending: false,
  });

  const rows = useMemo(() => {
    const next = responses
      .filter((response) => response.status !== 'joined')
      .map((response) => ({
        key: response._responseKey ?? response.studentUid,
        name: resolveName(response),
        stats:
          stats.byStudent.get(response._responseKey ?? response.studentUid) ??
          new Map<string, never>(),
      }));
    next.sort((a, b) => {
      if (sort.key === 'student') {
        const compared = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        return sort.descending ? -compared : compared;
      }
      const aValue = a.stats.get(sort.key)?.correctPercent ?? null;
      const bValue = b.stats.get(sort.key)?.correctPercent ?? null;
      if (aValue === null && bValue === null)
        return a.name.localeCompare(b.name);
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const compared = aValue - bValue;
      return sort.descending ? -compared : compared;
    });
    return next;
  }, [responses, resolveName, sort, stats.byStudent]);

  const changeSort = (key: SortState['key']): void => {
    setSort((current) => ({
      key,
      descending: current.key === key ? !current.descending : key !== 'student',
    }));
  };

  const exportCsv = (): void => {
    const csv = buildTargetGridCsv(
      columns,
      rows.map((row) => ({
        name: row.name,
        values: new Map(
          columns.map((column) => [
            column.target.id,
            row.stats.get(column.target.id)?.correctPercent ?? null,
          ])
        ),
      }))
    );
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quizTitle.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'quiz'}_target_mastery.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      {standards.length > 0 && (
        <section aria-labelledby="quiz-standard-rollups-heading">
          <h2
            id="quiz-standard-rollups-heading"
            className="mb-1.5 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary"
          >
            Standards
          </h2>
          <div className="flex flex-col gap-1.5">
            {standards.map((row) => (
              <MasteryRow key={row.target.id} row={row} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="quiz-target-mastery-heading">
        <h2
          id="quiz-target-mastery-heading"
          className="mb-1.5 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary"
        >
          Class mastery by target
        </h2>
        <div className="flex flex-col gap-1.5">
          {columns.map((row) => (
            <MasteryRow key={row.target.id} row={row} />
          ))}
        </div>
      </section>

      <section aria-labelledby="quiz-student-target-grid-heading">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2
            id="quiz-student-target-grid-heading"
            className="text-xxs font-bold uppercase tracking-wider text-brand-blue-primary"
          >
            Student × target
          </h2>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0 || columns.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-brand-gray-lighter bg-white px-2 py-1 text-xxs font-bold text-brand-blue-primary transition-colors hover:border-brand-blue-light disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-brand-gray-lighter bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="sticky left-0 z-10 min-w-36 border-b border-r border-slate-200 bg-slate-50 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => changeSort('student')}
                    className="inline-flex items-center gap-1 font-bold"
                  >
                    Student
                    <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.target.id}
                    className="min-w-28 border-b border-slate-200 px-2 py-2 text-center"
                    title={displayTarget(column)}
                  >
                    <button
                      type="button"
                      onClick={() => changeSort(column.target.id)}
                      className="mx-auto block max-w-32 truncate font-bold"
                    >
                      {column.target.code ?? column.target.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-slate-100 last:border-0"
                >
                  <th className="sticky left-0 z-10 border-r border-slate-100 bg-white px-2 py-2 text-left font-semibold text-slate-700">
                    {row.name}
                  </th>
                  {columns.map((column) => {
                    const value = row.stats.get(column.target.id);
                    return (
                      <td
                        key={column.target.id}
                        className={`px-2 py-2 text-center font-bold tabular-nums ${
                          value?.band
                            ? BAND_CELL[value.band]
                            : 'bg-slate-50 text-slate-400'
                        }`}
                        aria-label={`${row.name}, ${displayTarget(column)}: ${value?.correctPercent ?? 'not scored'}`}
                      >
                        {value?.correctPercent === null || !value
                          ? '—'
                          : `${value.correctPercent}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
