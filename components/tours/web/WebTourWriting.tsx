import React from 'react';
import { Loader2, MessageCircleQuestion, Undo2, X } from 'lucide-react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { focusRing, secondaryBtn } from '@/components/common/lightChrome';
import {
  cardInput,
  cardLabel,
} from '@/components/tours/editor/shell/stepCardParts';
import { MAX_GOAL_CHARS, MAX_NOTE_CHARS } from './recorderProtocol';
import { scrubCapturedText } from './studentData';
import { dismissQuestion } from './writeWithClaude';
import type { WebTourWriting } from './useWebTourWriting';

type Change = (update: (s: GuidedLearningSet) => GuidedLearningSet) => void;

const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-50';

/** Under the header after a run: Run again for questions, and Undo writing. */
export const WebWritingStrip: React.FC<{ writing: WebTourWriting }> = ({
  writing,
}) => {
  const { busy, asked, canUndo } = writing;
  if (!busy && !asked && !canUndo) return null;
  return (
    <div
      data-testid="web-writing-strip"
      className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-brand-blue-lighter px-2 py-1.5 text-xs"
    >
      {busy && (
        <span
          role="status"
          className="flex flex-1 items-center gap-1.5 px-1 font-semibold text-brand-blue-dark"
        >
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Claude is writing...
        </span>
      )}
      {!busy && <span className="flex-1" />}
      {asked && (
        <button
          type="button"
          className={`${secondaryBtn} px-2 py-1 text-xs ${disabledLook}`}
          disabled={busy}
          onClick={() => void writing.run('questions')}
          {...tourAttr('web-tour-editor.write-asked')}
        >
          Run again for questions
        </button>
      )}
      {canUndo && (
        <button
          type="button"
          className={`${secondaryBtn} inline-flex items-center gap-1 px-2 py-1 text-xs ${disabledLook}`}
          disabled={busy}
          onClick={writing.undo}
          {...tourAttr('web-tour-editor.undo-writing')}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Undo writing
        </button>
      )}
    </div>
  );
};

/** The tour's goal, which Claude reads before writing. */
export const WebTourGoalField: React.FC<{
  set: GuidedLearningSet;
  change: Change;
}> = ({ set, change }) => (
  <label className={cardLabel}>
    What does your tour explain?
    <textarea
      className={`${cardInput} resize-y`}
      rows={3}
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
);

/** Claude's question about a step, shown on its card until answered or dismissed. */
export const WebClaudeQuestion: React.FC<{
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
}> = ({ step, onChange }) => {
  const question = step.web?.claudeQuestion;
  if (!question) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-sm text-slate-800">
      <MessageCircleQuestion
        className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-primary"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 wrap-break-word">{question}</span>
      {/* no-tour-anchor: per-step controls repeat on every step */}
      <button
        type="button"
        className={`-m-1 shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
        aria-label="Dismiss question"
        title="Dismiss question"
        onClick={() => onChange(dismissQuestion(step))}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </p>
  );
};

/** The admin's private note for Claude on a step. */
export const WebClaudeNote: React.FC<{
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
    <label className={cardLabel}>
      Note for Claude
      {/* no-tour-anchor: per-step controls repeat on every step */}
      <textarea
        className={`${cardInput} resize-y`}
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
  );
};
