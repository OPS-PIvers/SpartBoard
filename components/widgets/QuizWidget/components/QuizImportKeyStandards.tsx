/** Standards a test bank key lists, offered in the import review (QUIZ_EXAMVIEW_IMPORT.md E10). */

import React, { useMemo } from 'react';
import { BookMarked, Check, Plus } from 'lucide-react';
import type { QuestionTargetTag, QuizQuestion } from '@/types';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import { tagFromBenchmark } from '@/utils/learningTargets';
import {
  matchStandardCodes,
  unmatchedStandardsNote,
  type StandardMatch,
} from '@/utils/quizDocumentImport/keyStandards';
import type { SuggestedTargetsSlots } from './QuizImportSuggestedTargets';

const hasTag = (q: QuizQuestion, tag: QuestionTargetTag): boolean =>
  (q.targets ?? []).some((t) => t.id === tag.id && t.kind === tag.kind);

const useKeyStandardSlots = (
  codes: ReadonlyMap<string, readonly string[]>
): SuggestedTargetsSlots => {
  const { benchmarks } = useStandardsCatalog();
  const matches = useMemo(() => {
    const out = new Map<string, StandardMatch>();
    codes.forEach((list, id) =>
      out.set(id, matchStandardCodes(list, benchmarks))
    );
    return out;
  }, [codes, benchmarks]);

  const pendingTags = (q: QuizQuestion): QuestionTargetTag[] =>
    (matches.get(q.id)?.matched ?? [])
      .map(tagFromBenchmark)
      .filter((tag) => !hasTag(q, tag));

  const header: SuggestedTargetsSlots['header'] = (questions, applyMany) => {
    const rows = questions.filter((q) => matches.get(q.id)?.matched.length);
    if (rows.length === 0) return null;
    const pending = rows.filter((q) => pendingTags(q).length > 0);
    const count = pending.reduce((n, q) => n + pendingTags(q).length, 0);
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <BookMarked className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          {pending.length === 0
            ? 'Standards from the key added'
            : `${rows.length} ${rows.length === 1 ? 'question lists' : 'questions list'} a standard from the key`}
        </p>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() =>
              applyMany(new Map(pending.map((q) => [q.id, pendingTags(q)])))
            }
            className="rounded-lg bg-brand-blue-primary px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-blue-dark"
          >
            {`Add ${count} ${count === 1 ? 'standard' : 'standards'}`}
          </button>
        )}
      </div>
    );
  };

  const row: SuggestedTargetsSlots['row'] = (question, number, apply) => {
    const match = matches.get(question.id);
    if (!match) return null;
    return (
      <div className="space-y-1">
        {match.matched.map((b) => {
          const tag = tagFromBenchmark(b);
          return hasTag(question, tag) ? (
            <p
              key={b.id}
              className="flex items-center gap-1 text-xs text-slate-600"
            >
              <Check className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              <span className="font-bold">Standard added:</span>
              <span className="min-w-0 truncate">{b.code}</span>
            </p>
          ) : (
            <div key={b.id} className="flex flex-wrap items-center gap-1.5">
              <span
                title={b.text}
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs text-slate-700"
              >
                <BookMarked
                  className="h-3 w-3 shrink-0 text-slate-500"
                  aria-hidden
                />
                <span className="font-bold">Standard from key:</span>
                <span className="min-w-0 truncate">{b.code}</span>
              </span>
              <button
                type="button"
                onClick={() => apply(tag)}
                aria-label={`Add standard ${b.code} to question ${number}`}
                className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-brand-blue-primary hover:bg-slate-50"
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add
              </button>
            </div>
          );
        })}
        {match.unmatched.length > 0 && (
          <p className="text-xs text-slate-600">
            {unmatchedStandardsNote(match.unmatched)}
          </p>
        )}
      </div>
    );
  };

  return { header, row };
};

/** Loads the catalog only when the key listed standards, then renders the review with the slots. */
export const WithKeyStandards: React.FC<{
  codes: ReadonlyMap<string, readonly string[]>;
  children: (slots: SuggestedTargetsSlots) => React.ReactNode;
}> = ({ codes, children }) => {
  const slots = useKeyStandardSlots(codes);
  return <>{children(slots)}</>;
};
