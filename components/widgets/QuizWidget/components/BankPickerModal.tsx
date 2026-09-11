import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Search, Shuffle, ListChecks, X } from 'lucide-react';
import type { QuizBankSlot, QuizQuestion, QuizStimulus } from '@/types';
import type { BankSource } from '@/hooks/useBankSources';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import {
  copyBankQuestions,
  eligibleBankQuestions,
  type BankContent,
} from '@/utils/questionBanks';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import { BankTargetFilter } from './BankTargetFilter';
import type { QuizEditorBankApi } from './QuizEditorModal';

export interface BankPickerModalProps {
  bankApi: QuizEditorBankApi;
  onClose: () => void;
  /** Pick mode: fresh copies (decision 22). */
  onInsertQuestions: (
    questions: QuizQuestion[],
    stimuli: QuizStimulus[]
  ) => void;
  /** Random mode: a new slot. */
  onAddSlot: (slot: QuizBankSlot) => void;
}

type Mode = 'pick' | 'random';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; content: BankContent }
  | { status: 'error'; message: string };

const sourceMatches = (s: BankSource, q: string): boolean =>
  !q ||
  s.title.toLowerCase().includes(q) ||
  (s.plcName ?? '').toLowerCase().includes(q) ||
  (s.sharedByName ?? '').toLowerCase().includes(q);

export const BankPickerModal: React.FC<BankPickerModalProps> = ({
  bankApi,
  onClose,
  onInsertQuestions,
  onAddSlot,
}) => {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<BankSource | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [mode, setMode] = useState<Mode>('pick');
  const [pickQuery, setPickQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [count, setCount] = useState(5);
  const [points, setPoints] = useState(1);
  const [targetFilter, setTargetFilter] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isEscapeFromWidgetInput(event)) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Bank content lives in Drive / Firestore; fetch when a bank is chosen.
  const sourceKey = source?.key ?? null;
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    bankApi
      .loadBankContent(source)
      .then((content) => {
        if (cancelled) return;
        setLoad({ status: 'ready', content });
        setCount(Math.max(1, Math.min(5, content.questions.length)));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoad({
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Could not load this bank.',
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const q = query.trim().toLowerCase();
  const personal = bankApi.sources.filter(
    (s) => s.kind === 'personal' && sourceMatches(s, q)
  );
  const shared = bankApi.sources.filter(
    (s) => s.kind === 'plc' && sourceMatches(s, q)
  );

  const content = load.status === 'ready' ? load.content : null;
  const pq = pickQuery.trim().toLowerCase();
  const pickRows = useMemo(
    () =>
      content
        ? content.questions.filter(
            (question) => !pq || question.text.toLowerCase().includes(pq)
          )
        : [],
    [content, pq]
  );
  const eligible = content
    ? eligibleBankQuestions(content, targetFilter).length
    : 0;
  const randomValid = count >= 1 && count <= eligible;

  const chooseSource = (s: BankSource) => {
    setSource(s);
    setPicked(new Set());
    setPickQuery('');
    setTargetFilter([]);
    setPoints(1);
  };

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (!source || !content) return;
    if (mode === 'pick') {
      const copied = copyBankQuestions(content, [...picked]);
      onInsertQuestions(copied.questions, copied.stimuli);
    } else {
      if (!randomValid) return;
      onAddSlot({
        id: crypto.randomUUID(),
        bankId: source.bankId,
        ...(source.syncGroupId ? { syncGroupId: source.syncGroupId } : {}),
        bankTitle: source.title,
        mode: 'random',
        count,
        ...(targetFilter.length > 0 ? { targetFilter } : {}),
        points,
      });
    }
    onClose();
  };

  const sourceRow = (s: BankSource) => (
    <button
      key={s.key}
      type="button"
      onClick={() => chooseSource(s)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-100"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800 truncate">
          {s.title}
        </span>
        {s.kind === 'plc' && (
          <span className="block text-xs text-slate-500 truncate">
            Shared by {s.sharedByName ?? 'a teammate'}
            {s.plcName ? ` · ${s.plcName}` : ''}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums">
        {s.questionCount} {s.questionCount === 1 ? 'question' : 'questions'}
      </span>
    </button>
  );

  const modeTab = (value: Mode, label: string, Icon: typeof Shuffle) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        mode === value
          ? 'bg-brand-blue-primary text-white'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: Z_INDEX.modalNestedContent }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Add from question bank"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          {source && (
            <button
              type="button"
              onClick={() => setSource(null)}
              aria-label="Back to banks"
              className="p-1 rounded text-slate-500 hover:bg-slate-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <h4 className="flex-1 text-sm font-bold text-slate-900 truncate">
            {source ? source.title : 'Add from question bank'}
          </h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-slate-500 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!source ? (
          <>
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search banks"
                  aria-label="Search banks"
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-300 focus:border-brand-blue-primary focus:outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
              {personal.length > 0 && (
                <section className="mb-3">
                  <h5 className="px-2 mb-1 text-xxs font-bold uppercase tracking-wider text-slate-500">
                    My banks
                  </h5>
                  {personal.map(sourceRow)}
                </section>
              )}
              {shared.length > 0 && (
                <section className="mb-3">
                  <h5 className="px-2 mb-1 text-xxs font-bold uppercase tracking-wider text-slate-500">
                    Shared with me
                  </h5>
                  {shared.map(sourceRow)}
                </section>
              )}
              {personal.length === 0 && shared.length === 0 && (
                <p className="px-2 py-4 text-sm text-slate-500 text-center">
                  No banks match.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              role="tablist"
              className="flex items-center gap-1 px-4 py-2 border-b border-slate-200"
            >
              {modeTab('pick', 'Pick questions', ListChecks)}
              {modeTab('random', 'Random draw', Shuffle)}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
              {load.status === 'loading' && (
                <p className="py-6 text-sm text-slate-500 text-center">
                  Loading bank…
                </p>
              )}
              {load.status === 'error' && (
                <p className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg text-xs text-brand-red-dark font-bold">
                  {load.message}
                </p>
              )}
              {content && mode === 'pick' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="search"
                        value={pickQuery}
                        onChange={(e) => setPickQuery(e.target.value)}
                        placeholder="Search questions"
                        aria-label="Search questions"
                        className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-300 focus:border-brand-blue-primary focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked(
                          picked.size === pickRows.length
                            ? new Set()
                            : new Set(pickRows.map((r) => r.id))
                        )
                      }
                      className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      {picked.size === pickRows.length && pickRows.length > 0
                        ? 'Clear'
                        : 'Select all'}
                    </button>
                  </div>
                  {pickRows.length === 0 ? (
                    <p className="py-4 text-sm text-slate-500 text-center">
                      No questions match.
                    </p>
                  ) : (
                    pickRows.map((question) => (
                      <label
                        key={question.id}
                        className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 accent-brand-blue-primary"
                          checked={picked.has(question.id)}
                          onChange={() => togglePicked(question.id)}
                        />
                        <span className="min-w-0 flex-1 text-sm text-slate-800">
                          <span className="mr-1.5 text-xxs font-bold uppercase tracking-wider text-slate-500">
                            {question.type === 'free-response'
                              ? 'FRQ'
                              : question.type}
                          </span>
                          <span className="line-clamp-2">
                            {question.text || 'Untitled question'}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
              {content && mode === 'random' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600">
                    Each student gets a fresh random set from this bank. The
                    bank is frozen when you assign, so later edits don&apos;t
                    change a running assignment.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass} htmlFor="bank-pick-count">
                        Questions per attempt
                      </label>
                      <input
                        id="bank-pick-count"
                        type="number"
                        min={1}
                        max={eligible || undefined}
                        value={count}
                        onChange={(e) =>
                          setCount(
                            Math.max(0, parseInt(e.target.value, 10) || 0)
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="bank-pick-points">
                        Points each
                      </label>
                      <input
                        id="bank-pick-points"
                        type="number"
                        min={1}
                        max={100}
                        value={points}
                        onChange={(e) =>
                          setPoints(
                            Math.min(
                              100,
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Only draw questions tagged with
                    </label>
                    <BankTargetFilter
                      bank={content}
                      value={targetFilter}
                      onChange={setTargetFilter}
                    />
                  </div>
                  <p
                    role="status"
                    className={`text-sm font-semibold ${randomValid ? 'text-slate-700' : 'text-brand-red-dark'}`}
                  >
                    Draws {count} of {eligible} eligible
                    {!randomValid &&
                      (count < 1
                        ? ' — draw at least 1.'
                        : ' — not enough eligible questions.')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-semibold rounded-lg text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={
                  !content ||
                  (mode === 'pick' ? picked.size === 0 : !randomValid)
                }
                className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand-blue-primary text-white hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mode === 'random'
                  ? 'Add random draw'
                  : picked.size > 0
                    ? `Add ${picked.size} ${picked.size === 1 ? 'question' : 'questions'}`
                    : 'Add questions'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
