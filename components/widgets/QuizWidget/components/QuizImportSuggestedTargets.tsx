/** Suggested learning-target chips and "Add all" for the import review (QUIZ_IMPORT_RELIABILITY.md R20). */

import React, { useMemo, useState } from 'react';
import { Check, Plus, Target } from 'lucide-react';
import type { QuestionTargetTag, QuizQuestion } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import {
  useLearningTargetSources,
  saveLearningTargetList,
} from '@/hooks/useLearningTargets';
import { canEditPlcContent } from '@/utils/plc';
import { logError } from '@/utils/logError';
import {
  createDestinations,
  createSuggestedTargets,
  planSuggestedTargets,
  resolveSuggestedTarget,
  suggestionKey,
  type SuggestedTarget,
} from '@/utils/quizDocumentImport/suggestedTargets';

/** Hooks the review table gives this panel so tags land in its own question state. */
export interface SuggestedTargetsSlots {
  header: (
    questions: readonly QuizQuestion[],
    applyMany: (
      tags: ReadonlyMap<
        string,
        QuestionTargetTag | readonly QuestionTargetTag[]
      >
    ) => void
  ) => React.ReactNode;
  row: (
    question: QuizQuestion,
    number: number,
    apply: (tag: QuestionTargetTag) => void
  ) => React.ReactNode;
}

const describe = (s: SuggestedTarget): string =>
  s.code ? `${s.code} · ${s.label}` : s.label;

const hasTag = (q: QuizQuestion, tag: QuestionTargetTag): boolean =>
  (q.targets ?? []).some((t) => t.id === tag.id && t.kind === tag.kind);

/** Builds the slots; mounted only when the read found target lines, so other imports start no listeners. */
const useSuggestedTargetsSlots = (
  suggestions: ReadonlyMap<string, SuggestedTarget>
): SuggestedTargetsSlots => {
  const { user } = useAuth();
  const { sources, loading } = useLearningTargetSources();
  const { plcs } = usePlcs();
  const editablePlcIds = useMemo(
    () =>
      new Set(
        user
          ? plcs.filter((p) => canEditPlcContent(p, user.uid)).map((p) => p.id)
          : []
      ),
    [plcs, user]
  );
  const destinations = useMemo(
    () => createDestinations(sources, editablePlcIds),
    [sources, editablePlcIds]
  );
  const [destIndex, setDestIndex] = useState(0);
  const destination = destinations[destIndex] ?? destinations[0];
  // Targets made here, until the list listener catches up, so a second click never duplicates one.
  const [created, setCreated] = useState<
    ReadonlyMap<string, QuestionTargetTag>
  >(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagFor = (s: SuggestedTarget): QuestionTargetTag | null => {
    const made = created.get(suggestionKey(s));
    if (made) return made;
    const resolved = resolveSuggestedTarget(s, sources);
    return resolved.kind === 'existing' ? resolved.tag : null;
  };

  /** Creates what's missing in the chosen list and returns every tag by suggestion key. */
  const ensureTargets = async (
    wanted: readonly SuggestedTarget[]
  ): Promise<Map<string, QuestionTargetTag> | null> => {
    const plan = planSuggestedTargets(wanted, sources);
    const tags = new Map(plan.existing);
    const toCreate = plan.toCreate.filter(({ key }) => {
      const made = created.get(key);
      if (made) tags.set(key, made);
      return !made;
    });
    if (toCreate.length === 0) return tags;
    if (!destination) return null;
    const source = sources.find((s) =>
      destination.kind === 'plc'
        ? s.kind === 'plc' && s.ownerId === destination.plcId
        : s.kind === 'personal'
    );
    if (!source?.list || !user) return null;
    setBusy(true);
    setError(null);
    try {
      const result = createSuggestedTargets(source.list, toCreate, destination);
      await saveLearningTargetList(
        destination.kind === 'plc'
          ? { kind: 'plc', plcId: destination.plcId }
          : { kind: 'personal', uid: user.uid },
        result.list
      );
      setCreated((prev) => new Map([...prev, ...result.tags]));
      result.tags.forEach((tag, key) => tags.set(key, tag));
      return tags;
    } catch (err) {
      logError('QuizImportSuggestedTargets', err);
      setError(
        err instanceof Error && /at most/.test(err.message)
          ? err.message
          : 'Couldn’t save the new targets. Try again.'
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const listReady = destination
    ? destination.kind === 'plc'
      ? Boolean(
          sources.find(
            (s) => s.kind === 'plc' && s.ownerId === destination.plcId
          )?.list
        )
      : Boolean(sources.find((s) => s.kind === 'personal')?.list)
    : false;
  const disabled = busy || loading || !listReady;

  const header: SuggestedTargetsSlots['header'] = (questions, applyMany) => {
    const rows = questions.filter((q) => suggestions.has(q.id));
    if (rows.length === 0) return null;
    const pending = rows.filter((q) => {
      const s = suggestions.get(q.id);
      const tag = s ? tagFor(s) : null;
      return !tag || !hasTag(q, tag);
    });
    const distinct = new Set(
      pending.flatMap((q) => {
        const s = suggestions.get(q.id);
        return s ? [suggestionKey(s)] : [];
      })
    );
    const addAll = async () => {
      const wanted = pending.flatMap((q) => {
        const s = suggestions.get(q.id);
        return s ? [s] : [];
      });
      const tags = await ensureTargets(wanted);
      if (!tags) return;
      const byQuestion = new Map<string, QuestionTargetTag>();
      for (const q of pending) {
        const s = suggestions.get(q.id);
        const tag = s ? tags.get(suggestionKey(s)) : undefined;
        if (tag) byQuestion.set(q.id, tag);
      }
      applyMany(byQuestion);
    };
    return (
      <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Target className="h-3.5 w-3.5 text-slate-500" aria-hidden />
            {pending.length === 0
              ? `Suggested targets added to all ${rows.length} ${rows.length === 1 ? 'question' : 'questions'}`
              : `${rows.length} ${rows.length === 1 ? 'question lists' : 'questions list'} a learning target`}
          </p>
          {pending.length > 0 && (
            <button
              type="button"
              onClick={() => void addAll()}
              disabled={disabled}
              className="rounded-lg bg-brand-blue-primary px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {busy
                ? 'Adding…'
                : `Add all ${distinct.size} suggested ${distinct.size === 1 ? 'target' : 'targets'}`}
            </button>
          )}
        </div>
        {destinations.length > 1 && pending.length > 0 && (
          <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            New targets go in
            <select
              value={destIndex}
              onChange={(e) => setDestIndex(Number(e.target.value))}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:border-brand-blue-primary focus:outline-none"
            >
              {destinations.map((d, i) => (
                <option key={d.kind === 'plc' ? d.plcId : 'personal'} value={i}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="text-xs font-bold text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  };

  const row: SuggestedTargetsSlots['row'] = (question, number, apply) => {
    const s = suggestions.get(question.id);
    if (!s) return null;
    const tag = tagFor(s);
    if (tag && hasTag(question, tag)) {
      return (
        <p className="flex items-center gap-1 text-xs text-slate-600">
          <Check className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          <span className="font-bold">Target added:</span>
          <span className="min-w-0 truncate">{describe(s)}</span>
        </p>
      );
    }
    const onClick = async () => {
      if (tag) {
        apply(tag);
        return;
      }
      const tags = await ensureTargets([s]);
      const made = tags?.get(suggestionKey(s));
      if (made) apply(made);
    };
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs text-slate-700">
          <Target className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
          <span className="font-bold">Suggested target:</span>
          <span className="min-w-0 truncate">{describe(s)}</span>
        </span>
        <button
          type="button"
          onClick={() => void onClick()}
          disabled={!tag && disabled}
          aria-label={`${tag ? 'Add target' : 'Create target'} ${describe(s)} to question ${number}`}
          className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-brand-blue-primary hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {tag ? 'Add' : 'Create target'}
        </button>
      </div>
    );
  };

  return { header, row };
};

/** Mounts the listeners only when there are suggestions, then renders the review with the slots. */
export const WithSuggestedTargets: React.FC<{
  suggestions: ReadonlyMap<string, SuggestedTarget>;
  children: (slots: SuggestedTargetsSlots) => React.ReactNode;
}> = ({ suggestions, children }) => {
  const slots = useSuggestedTargetsSlots(suggestions);
  return <>{children(slots)}</>;
};
