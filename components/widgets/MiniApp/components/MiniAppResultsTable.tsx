// Results table for v2 Mini App sessions: one row per student, a column per question (docs/plans/MINI_APP_RESULTS.md D10).
import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Download, X } from 'lucide-react';
import type { MiniAppBestAttempt, MiniAppManifestQuestion } from '@/types';

export interface MiniAppResultRow {
  id: string;
  name: string;
  attemptCount: number;
  best: MiniAppBestAttempt | null;
  lastSubmittedAt: number;
  /** "I'm Done" with no graded attempt. */
  doneOnly: boolean;
}

export interface MiniAppAttemptView {
  attemptNo: number;
  submittedAt: number;
  score?: number;
  maxScore?: number;
  gradedBy?: 'server' | 'app' | null;
  /** Old apps' free-form result, shown as-is. */
  rawPayload?: unknown;
}

const formatTime = (ms: number): string =>
  ms > 0
    ? new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const scoreText = (score: number, max: number): string =>
  `${Number(score.toFixed(2))}/${Number(max.toFixed(2))}`;

const FromApp: React.FC = () => (
  <span
    className="ml-1 text-xs font-medium text-slate-500"
    title="Scored by the app, not by your answer key"
  >
    from app
  </span>
);

export const MiniAppResultsTable: React.FC<{
  rows: MiniAppResultRow[];
  questions: MiniAppManifestQuestion[];
  attemptLimit: number | null;
  loadAttempts: (rowId: string) => Promise<MiniAppAttemptView[]>;
  onExport?: () => void;
  exporting?: boolean;
}> = ({ rows, questions, attemptLimit, loadAttempts, onExport, exporting }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<
    Record<string, MiniAppAttemptView[] | 'loading' | 'error'>
  >({});

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (attempts[id] && attempts[id] !== 'error') return;
    setAttempts((prev) => ({ ...prev, [id]: 'loading' }));
    loadAttempts(id).then(
      (list) => setAttempts((prev) => ({ ...prev, [id]: list })),
      () => setAttempts((prev) => ({ ...prev, [id]: 'error' }))
    );
  };

  const colSpan = 4 + questions.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {rows.length} {rows.length === 1 ? 'student' : 'students'}
        </p>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-slate-100 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {exporting ? 'Exporting…' : 'Export to Sheets'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
              <th className="py-2 pr-3 font-bold">Student</th>
              <th className="py-2 pr-3 font-bold">Best score</th>
              <th className="py-2 pr-3 font-bold">Attempts</th>
              <th className="py-2 pr-3 font-bold">Last submitted</th>
              {questions.map((q, i) => (
                <th
                  key={q.id}
                  className="py-2 px-1 text-center font-bold"
                  title={q.prompt}
                >
                  Q{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = openId === row.id;
              const Chevron = open ? ChevronDown : ChevronRight;
              const marks = new Map(
                (row.best?.items ?? []).map((m) => [m.id, m])
              );
              const list = attempts[row.id];
              return (
                <React.Fragment key={row.id}>
                  <tr className="border-b border-slate-100 align-middle">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => toggle(row.id)}
                        aria-expanded={open}
                        className="flex items-center gap-1.5 text-left font-bold text-slate-800"
                      >
                        <Chevron
                          className="h-4 w-4 shrink-0 text-slate-400"
                          aria-hidden
                        />
                        <span className="break-words">{row.name}</span>
                      </button>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-700">
                      {row.best ? (
                        <>
                          {scoreText(row.best.score, row.best.maxScore)}
                          {row.best.gradedBy === 'app' && <FromApp />}
                        </>
                      ) : row.doneOnly ? (
                        'Done'
                      ) : (
                        <span className="text-slate-400">No score</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-700">
                      {attemptLimit === null
                        ? row.attemptCount
                        : `${row.attemptCount} of ${attemptLimit}`}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                      {formatTime(row.lastSubmittedAt)}
                    </td>
                    {questions.map((q) => {
                      const mark = marks.get(q.id);
                      return (
                        <td key={q.id} className="py-2 px-1 text-center">
                          {mark ? (
                            mark.correct ? (
                              <Check
                                className="mx-auto h-4 w-4 text-emerald-600"
                                aria-label="Correct"
                              />
                            ) : (
                              <X
                                className="mx-auto h-4 w-4 text-brand-red-primary"
                                aria-label="Incorrect"
                              />
                            )
                          ) : (
                            <span className="text-slate-300" aria-hidden>
                              ·
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td colSpan={colSpan} className="py-2 pl-7 pr-3">
                        {list === 'loading' || list === undefined ? (
                          <p className="text-xs text-slate-500">Loading…</p>
                        ) : list === 'error' ? (
                          <p className="text-xs text-brand-red-primary">
                            Could not load attempts.
                          </p>
                        ) : list.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No graded attempts.
                          </p>
                        ) : (
                          <ul className="divide-y divide-slate-200">
                            {list.map((a) => (
                              <li key={a.attemptNo} className="py-1.5 text-xs">
                                <div className="flex flex-wrap items-baseline gap-x-3 text-slate-700">
                                  <span className="font-bold">
                                    Attempt {a.attemptNo}
                                  </span>
                                  {a.score !== undefined &&
                                    a.maxScore !== undefined && (
                                      <span>
                                        {scoreText(a.score, a.maxScore)}
                                        {a.gradedBy === 'app' && <FromApp />}
                                      </span>
                                    )}
                                  <span className="text-slate-500">
                                    {formatTime(a.submittedAt)}
                                  </span>
                                </div>
                                {a.rawPayload !== undefined && (
                                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                                    {JSON.stringify(a.rawPayload, null, 2)}
                                  </pre>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
