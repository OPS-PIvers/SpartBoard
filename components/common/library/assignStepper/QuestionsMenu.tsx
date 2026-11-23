// Questions rule for a modification group: which of the quiz's questions these students answer.
import React, { useId, useState } from 'react';
import { ChevronDown, ListChecks, Search } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import type { OverrideEditorQuestion } from '../OverrideEditorRow';
import { randomQuestionPick } from './modificationGroups';

const CountInput: React.FC<{
  value: number;
  total: number;
  onChange: (n: number) => void;
}> = ({ value, total, onChange }) => {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const n = Math.min(total, Math.round(Number(draft)));
    // Leaving the box unchanged keeps a hand-picked set.
    if (Number.isFinite(n) && n >= 1 && n !== value) onChange(n);
  };
  return (
    <span className="flex items-center gap-2 text-sm text-slate-700">
      <input
        id={id}
        type="number"
        min={1}
        max={total}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        aria-label="Number of questions"
        {...tourAttr('assign-mods.questions-count')}
        className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm touch:h-11"
      />
      <label htmlFor={id} className="text-slate-500">
        of {total}
      </label>
    </span>
  );
};

/** Ids of the picked questions still in the quiz; every question when none is. */
const pickedIds = (
  questions: OverrideEditorQuestion[],
  picked: readonly string[] | undefined
): Set<string> => {
  const stillThere = questions.filter((q) => picked?.includes(q.id));
  return new Set(
    (stillThere.length > 0 ? stillThere : questions).map((q) => q.id)
  );
};

const QuestionsDialog: React.FC<{
  questions: OverrideEditorQuestion[];
  picked: string[] | undefined;
  onSave: (next: string[] | undefined) => void;
  onClose: () => void;
}> = ({ questions, picked, onSave, onClose }) => {
  const total = questions.length;
  const [draft, setDraft] = useState(() => pickedIds(questions, picked));
  const [search, setSearch] = useState('');
  const count = draft.size;
  const pickCount = (n: number) =>
    setDraft(
      new Set(
        n >= total
          ? questions.map((q) => q.id)
          : randomQuestionPick(questions, n)
      )
    );

  const q = search.trim().toLocaleLowerCase();
  const shown = questions
    .map((question, i) => ({ question, number: i + 1 }))
    .filter(
      ({ question, number }) =>
        !q ||
        question.label.toLocaleLowerCase().includes(q) ||
        String(number) === q
    );

  const footer = (
    <div className="flex justify-center gap-2">
      <button
        type="button"
        onClick={onClose}
        {...tourAttr('assign-mods.questions-cancel')}
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          onSave(
            count >= total
              ? undefined
              : questions.filter((x) => draft.has(x.id)).map((x) => x.id)
          );
          onClose();
        }}
        {...tourAttr('assign-mods.questions-done')}
        className="rounded-xl bg-brand-blue-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
      >
        Done
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Questions"
      maxWidth="max-w-xl"
      zIndex="z-modal-deep"
      contentClassName="px-6 pb-4"
      footer={footer}
      footerClassName="px-6 py-3"
      captureEscape
    >
      <div className="sticky top-0 z-10 space-y-3 bg-white pb-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CountInput value={count} total={total} onChange={pickCount} />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => pickCount(count)}
              disabled={count >= total}
              {...tourAttr('assign-mods.questions-random')}
              className="touch-target-expand text-sm font-bold text-brand-blue-primary hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
            >
              Pick at random
            </button>
            <button
              type="button"
              onClick={() => setDraft(new Set(questions.map((x) => x.id)))}
              disabled={count >= total}
              {...tourAttr('assign-mods.questions-all')}
              className="touch-target-expand text-sm font-bold text-slate-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
            >
              Select all
            </button>
          </div>
        </div>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions"
            aria-label="Search questions"
            {...tourAttr('assign-mods.questions-search')}
            className="min-w-0 flex-1 bg-transparent text-sm focus:outline-hidden"
          />
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {shown.map(({ question, number }) => (
          <label
            key={question.id}
            className="flex cursor-pointer items-start gap-3 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={draft.has(question.id)}
              onChange={() => {
                const next = new Set(draft);
                if (next.has(question.id)) next.delete(question.id);
                else next.add(question.id);
                // At least one question stays, so the students have something to answer.
                if (next.size > 0) setDraft(next);
              }}
              {...tourFieldAttr(
                'assign-mods.question',
                'assign',
                `row-${number}`
              )}
              className="mt-0.5 h-4 w-4 shrink-0 rounded-sm accent-brand-blue-primary"
            />
            <span className="w-7 shrink-0 pt-px text-right text-xs tabular-nums text-slate-400">
              {number}
            </span>
            <span className="min-w-0 flex-1">{question.label}</span>
          </label>
        ))}
        {shown.length === 0 && (
          <p className="py-3 text-sm text-slate-500">No questions found</p>
        )}
      </div>
    </Modal>
  );
};

export const QuestionsMenu: React.FC<{
  questions: OverrideEditorQuestion[];
  /** Absent means every question. */
  picked: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}> = ({ questions, picked, onChange }) => {
  const [open, setOpen] = useState(false);
  const total = questions.length;
  const count = pickedIds(questions, picked).size;
  const reduced = count < total;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        {...tourAttr('assign-mods.questions')}
        className={`touch-target-expand flex h-8 min-w-44 max-w-60 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-sm hover:border-slate-400 ${
          reduced
            ? 'border-brand-blue-primary/50 bg-brand-blue-lighter/40 font-semibold text-brand-blue-dark'
            : 'border-slate-300 bg-white text-slate-700'
        }`}
      >
        <ListChecks
          className="h-3.5 w-3.5 shrink-0 text-slate-500"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {reduced ? `${count} of ${total}` : 'All'}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden
        />
      </button>
      {open && (
        <QuestionsDialog
          questions={questions}
          picked={picked}
          onSave={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
