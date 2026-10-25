import React, { useState } from 'react';
import {
  Loader2,
  MessageCircleQuestion,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import {
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { MAX_GOAL_CHARS, MAX_NOTE_CHARS } from './recorderProtocol';
import { scrubCapturedText } from './studentData';
import {
  applyWriting,
  dismissQuestion,
  requestWebTourWriting,
  undoWriting,
  writingRequests,
  type WritingMode,
  type WritingUndo,
} from './writeWithClaude';

type Change = (update: (s: GuidedLearningSet) => GuidedLearningSet) => void;

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// "3", "3 and 5", "3, 5 and 9".
const listNumbers = (ns: number[]) =>
  ns.length < 2
    ? ns.join('')
    : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;

const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-50';

/** The tour's goal and the Write with Claude buttons, with one Undo per run. */
export const WebTourWriting: React.FC<{
  set: GuidedLearningSet;
  change: Change;
  /** Saves the draft now and returns it, so the server reads what is on screen. */
  flush: () => Promise<GuidedLearningSet>;
  onStatus: (status: string) => void;
}> = ({ set, change, flush, onStatus }) => {
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<WritingUndo | null>(null);
  const asked = set.steps.some((s) => s.web?.claudeQuestion);

  const run = async (mode: WritingMode) => {
    setBusy(true);
    onStatus('');
    try {
      const saved = await flush();
      const requests = writingRequests(saved, mode);
      if (requests.length === 0) {
        onStatus('Every title and tip is filled in.');
        return;
      }
      const { steps: written, failed } = await requestWebTourWriting(
        saved.id,
        requests
      );
      const ran: { r?: ReturnType<typeof applyWriting> } = {};
      change((cur) => {
        ran.r = applyWriting(cur, written, mode);
        return ran.r.set;
      });
      const failedNumbers = saved.steps.flatMap((s, i) =>
        failed.includes(s.id) ? [i + 1] : []
      );
      const { r } = ran;
      if (!r) return;
      setUndo(Object.keys(r.undo).length ? r.undo : null);
      const parts = [
        r.wrote ? `Claude wrote ${count(r.wrote, 'step', 'steps')}.` : '',
        r.asked ? `Claude asked about ${count(r.asked, 'step', 'steps')}.` : '',
        failedNumbers.length
          ? `Claude couldn't write ${failedNumbers.length === 1 ? 'step' : 'steps'} ${listNumbers(failedNumbers)}. Try again.`
          : '',
      ].filter(Boolean);
      onStatus(parts.join(' ') || 'Claude had nothing to add.');
    } catch (err) {
      logError('web tour writing', err, { setId: set.id });
      onStatus("Claude couldn't write the steps. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-slate-700">
          What does your tour explain?
        </span>
        <textarea
          className={`${inputLight} rounded-lg px-2.5 py-1.5`}
          rows={2}
          maxLength={MAX_GOAL_CHARS}
          value={set.webGoal ?? ''}
          onChange={(e) => {
            const webGoal = e.target.value;
            change((cur) => ({ ...cur, webGoal }));
          }}
          onBlur={() => {
            const clean = scrubCapturedText(set.webGoal, MAX_GOAL_CHARS);
            if (clean === (set.webGoal ?? '')) return;
            change(({ webGoal: _old, ...cur }) =>
              clean ? { ...cur, webGoal: clean } : cur
            );
          }}
          {...tourAttr('web-tour-editor.goal')}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${primaryBtn} inline-flex items-center gap-1.5 ${disabledLook}`}
          disabled={busy || set.steps.length === 0}
          onClick={() => void run('blanks')}
          {...tourAttr('web-tour-editor.write-with-claude')}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {busy ? 'Writing...' : 'Write with Claude'}
        </button>
        <button
          type="button"
          className={`${secondaryBtn} ${disabledLook}`}
          disabled={busy || set.steps.length === 0}
          onClick={() => void run('all')}
          {...tourAttr('web-tour-editor.rewrite-all')}
        >
          Rewrite all
        </button>
        {asked && (
          <button
            type="button"
            className={`${secondaryBtn} ${disabledLook}`}
            disabled={busy}
            onClick={() => void run('questions')}
            {...tourAttr('web-tour-editor.write-asked')}
          >
            Run again for questions
          </button>
        )}
        {undo && (
          <button
            type="button"
            className={`${secondaryBtn} inline-flex items-center gap-1.5 ${disabledLook}`}
            disabled={busy}
            onClick={() => {
              change((cur) => undoWriting(cur, undo));
              setUndo(null);
              onStatus('');
            }}
            {...tourAttr('web-tour-editor.undo-writing')}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Undo
          </button>
        )}
      </div>
    </div>
  );
};

/** Under a step's tip: Claude's question, and the admin's private note for Claude. */
export const WebStepClaudeFields: React.FC<{
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
}> = ({ step, onChange }) => {
  const web = step.web;
  if (!web) return null;
  const setNote = (note: string) => {
    const { note: _old, ...rest } = web;
    onChange({ ...step, web: note ? { ...rest, note } : rest });
  };
  return (
    <>
      {web.claudeQuestion && (
        <p className="flex items-start gap-2 rounded-lg bg-brand-blue-lighter px-3 py-2 text-sm text-slate-800">
          <MessageCircleQuestion
            className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-primary"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 break-words">
            {web.claudeQuestion}
          </span>
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <button
            type="button"
            className="-m-1 shrink-0 rounded p-1 text-slate-500 hover:bg-white/60 hover:text-slate-900"
            aria-label="Dismiss question"
            title="Dismiss question"
            onClick={() => onChange(dismissQuestion(step))}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-slate-700">Note for Claude</span>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <textarea
          className={`${inputLight} rounded-lg px-2.5 py-1.5`}
          rows={2}
          maxLength={MAX_NOTE_CHARS}
          value={web.note ?? ''}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            const clean = scrubCapturedText(web.note, MAX_NOTE_CHARS);
            if (clean !== (web.note ?? '')) setNote(clean);
          }}
        />
      </label>
    </>
  );
};
