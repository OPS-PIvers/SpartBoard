// The student Writing page: prompt, sources beside the editor, save state, and Turn in or Take back (D12, D23, D24).
import React, { useId, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CloudOff,
  Copy,
  Loader2,
  MonitorSmartphone,
  Smartphone,
} from 'lucide-react';
import { PromptText } from '@/components/common/PromptText';
import { StimulusTabsPanel } from '@/components/quiz/StimulusTabsPanel';
import { StimulusRenderer } from '@/components/quiz/QuizStimulusView';
import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';
import type { WritingAssignmentSession } from '@/types';
import type { UnsentWriting, WritingNotice } from '@/hooks/useWritingPiece';
import type { WritingPageView } from '@/utils/writingStudentView';
import { sanitizeQuizResponse } from '@/utils/security';
import { StudentPageShell } from '../StudentPageShell';

export type WritingShellSession = Pick<
  WritingAssignmentSession,
  'title' | 'prompt' | 'minWords' | 'maxWords' | 'dueAt' | 'timeLimitMinutes'
> &
  Partial<
    Pick<
      WritingAssignmentSession,
      'stimuli' | 'enforceWordLimit' | 'recordingNotice' | 'spellCheck'
    >
  >;

/** Everything the page needs from the live piece; absent in the teacher's preview. */
export interface WritingShellPiece {
  view: WritingPageView;
  editorKey: string;
  editorHtml: string;
  unsent: UnsentWriting[];
  notice: WritingNotice | null;
  busy: 'turn-in' | 'take-back' | null;
  online: boolean;
  /** D4/D22: the right-click menu stays on only for spelling help. */
  contextMenuOff: boolean;
  onStart: () => void;
  onTurnIn: () => void;
  onTakeBack: () => void;
  onContinueHere: () => void;
  onDismissUnsent: (savedAt: number) => void;
  onUnsentCopy: (text: string) => void;
  onEditorChange: (html: string) => void;
  allowInsert: (text: string, via: 'paste' | 'drop' | 'drag-inside') => boolean;
  onEditorCopy: (text: string) => void;
  bindEditor: (el: HTMLElement | null) => void;
}

/** Student-facing wording, listed in pr-b2-strings.md for review. */
export const WRITING_STRINGS = {
  status: {
    none: 'Not started',
    draft: 'In progress',
    'turned-in': 'Turned in',
    returned: 'Returned',
    revising: 'Returned for revision',
  },
  start: 'Start writing',
  timedStart: (m: number) => `You have ${m} minutes once you start.`,
  recording: 'Your writing is recorded as you work.',
  placeholder: 'Start writing here.',
  saving: 'Saving...',
  saved: 'Saved',
  savedDevice: 'Saved on this device',
  savedDeviceTitle: 'It sends when you are back online.',
  notSaved: 'Not saved',
  notSavedBody:
    "Your writing isn't saved yet. Keep this tab open, or copy your text somewhere safe.",
  notSavedNotice:
    "Your writing didn't save. Check your connection and try again.",
  offline:
    "You're offline. Keep this tab open and your writing will save when you reconnect.",
  takenOverTitle: 'This writing is open in another tab',
  takenOverBody: 'Keep writing there, or continue here.',
  continueHere: 'Continue here',
  unsentTitle: 'Unsent writing from this device',
  unsentBody:
    'This was not sent because your writing changed somewhere else. Copy anything you need.',
  copyText: 'Copy text',
  copied: 'Copied',
  dismiss: 'Dismiss',
  pasteBlocked:
    'Paste is off for this assignment. You can still move your own text.',
  turnIn: 'Turn in',
  turningIn: 'Turning in...',
  tooShort: (min: number, gap: number) =>
    `Write at least ${min} words to turn in. ${gap} to go.`,
  tooLong: (max: number, gap: number) =>
    `Your writing is ${gap} ${gap === 1 ? 'word' : 'words'} over the ${max}-word limit. Trim it to turn in.`,
  turnedIn: 'You turned this in.',
  takeBack: 'Take back',
  takingBack: 'Taking back...',
  takeBackFeedback:
    'Your teacher has started on feedback, so this can no longer be taken back.',
  takeBackPastDue:
    'This is past its due date, so it can no longer be taken back.',
  takeBackFailed: "Couldn't take this back. Try again.",
  turnInFailed: "Couldn't turn this in. Try again.",
  tooLarge: 'This piece is too long to turn in. Shorten it and try again.',
  paused: "Your class isn't open right now. Turn this in when it starts again.",
  returned: 'Your teacher returned this.',
  revising: 'Your teacher returned this for revision. You can keep writing.',
  closed: 'This assignment is closed.',
  openFailed: "Couldn't open your writing.",
  tryAgain: 'Try again',
} as const;

const S = WRITING_STRINGS;

const DUE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const wordLimitLabel = (min?: number, max?: number): string | null => {
  if (min && max) return `${min} to ${max} words`;
  if (min) return `At least ${min} words`;
  if (max) return `Up to ${max} words`;
  return null;
};

const PRIMARY_BTN =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-blue-primary px-6 text-sm font-bold text-white shadow-xs transition-colors hover:bg-brand-blue-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light disabled:cursor-not-allowed disabled:opacity-50';

const noticeText = (n: WritingNotice): string | null => {
  switch (n) {
    case 'paste-blocked':
      return S.pasteBlocked;
    case 'not-saved':
      return S.notSavedNotice;
    case 'too-large':
      return S.tooLarge;
    case 'paused':
      return S.paused;
    case 'turn-in-failed':
      return S.turnInFailed;
    case 'closed':
      return S.closed;
    case 'take-back-feedback':
      return S.takeBackFeedback;
    case 'take-back-past-due':
      return S.takeBackPastDue;
    case 'take-back-failed':
      return S.takeBackFailed;
    default:
      return null;
  }
};

const plainOf = (html: string): string => {
  const el = document.createElement('div');
  el.innerHTML = sanitizeQuizResponse(html);
  for (const block of Array.from(el.querySelectorAll('p, li, br')))
    block.after('\n');
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
};

const UnsentPanel: React.FC<{
  unsent: UnsentWriting;
  onCopy: (text: string) => void;
  onDismiss: () => void;
}> = ({ unsent, onCopy, onDismiss }) => {
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const copy = () => {
    const text = plainOf(unsent.html);
    onCopy(text);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
    >
      <div className="flex items-start gap-3">
        <Smartphone
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id={titleId} className="text-sm font-bold">
            {S.unsentTitle}
          </h2>
          <p className="text-sm">{S.unsentBody}</p>
          <div
            className="rich-text-content max-h-48 overflow-y-auto rounded-xl border border-amber-200 bg-white px-4 py-3 pb-4 text-sm text-slate-800 select-text"
            onCopy={() => onCopy(document.getSelection()?.toString() ?? '')}
            dangerouslySetInnerHTML={{
              __html: sanitizeQuizResponse(unsent.html),
            }}
          />
          <div className="flex flex-wrap gap-2">
            {/* no-tour-anchor: student page; live tours run in the teacher app */}
            <button type="button" onClick={copy} className={SECONDARY_BTN}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? S.copied : S.copyText}
            </button>
            {/* no-tour-anchor: student page; live tours run in the teacher app */}
            <button type="button" onClick={onDismiss} className={SECONDARY_BTN}>
              {S.dismiss}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const SaveState: React.FC<{ view: WritingPageView }> = ({ view }) => {
  if (!view.saveState) return <span />;
  if (view.saveState === 'failed')
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700"
        data-testid="writing-save-state"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {S.notSaved}
      </span>
    );
  if (view.saveState === 'device')
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800"
        title={S.savedDeviceTitle}
        data-testid="writing-save-state"
      >
        <CloudOff className="h-4 w-4" aria-hidden="true" />
        {S.savedDevice}
      </span>
    );
  return (
    <span
      className="text-sm text-slate-500"
      aria-live="polite"
      data-testid="writing-save-state"
    >
      {view.saveState === 'saving' ? S.saving : S.saved}
    </span>
  );
};

export const WritingStudentShell: React.FC<{
  session: WritingShellSession;
  piece?: WritingShellPiece;
  onDone: () => void;
}> = ({ session, piece, onDone }) => {
  const view: WritingPageView = piece?.view ?? {
    mode: 'not-started',
    status: null,
    editable: false,
    wordCount: 0,
    showTurnIn: false,
    turnInBlockedBy: null,
    wordGap: 0,
    showTakeBack: false,
    saveState: null,
  };
  const statusKey = view.status ?? 'none';
  const limit = wordLimitLabel(session.minWords, session.maxWords);
  const stimuli = session.stimuli ?? [];
  const notice = piece?.notice ? noticeText(piece.notice) : null;
  const showEditor =
    view.mode !== 'not-started' &&
    view.mode !== 'loading' &&
    !(view.mode === 'closed' && view.status === null);

  const wordMessage =
    view.turnInBlockedBy === 'too-short' && session.minWords
      ? S.tooShort(session.minWords, view.wordGap)
      : view.turnInBlockedBy === 'too-long' && session.maxWords
        ? S.tooLong(session.maxWords, view.wordGap)
        : null;

  const bindEditor = piece?.bindEditor;
  const editor = showEditor && piece && (
    <div ref={bindEditor} className="min-w-0">
      <WrittenResponseEditor
        questionKey={piece.editorKey}
        value={piece.editorHtml}
        onChange={piece.onEditorChange}
        placeholder={view.editable ? S.placeholder : undefined}
        minWords={session.minWords}
        maxWords={session.maxWords}
        enforceWordLimit={session.enforceWordLimit}
        spellCheck={session.spellCheck !== false}
        disabled={!view.editable}
        dimWhenDisabled={false}
        light
        allowInsert={piece.allowInsert}
        onCopyText={piece.onEditorCopy}
        blockContextMenu={piece.contextMenuOff}
        minHeightPx={440}
      />
    </div>
  );

  return (
    <StudentPageShell onDone={onDone} doneAction="back">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {session.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
              {typeof session.dueAt === 'number' && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Due {DUE_FORMAT.format(session.dueAt)}
                </span>
              )}
              {limit && <span>{limit}</span>}
              {session.timeLimitMinutes ? (
                <span>{session.timeLimitMinutes} minutes</span>
              ) : null}
            </div>
          </div>
          <span
            className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"
            data-testid="writing-status"
          >
            {S.status[statusKey]}
          </span>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800">
          <PromptText text={session.prompt} />
          {session.recordingNotice && (
            <p className="mt-3 text-xs font-medium text-slate-500">
              {S.recording}
            </p>
          )}
        </section>

        {view.mode === 'not-started' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            {session.timeLimitMinutes ? (
              <p className="text-sm text-slate-600">
                {S.timedStart(session.timeLimitMinutes)}
              </p>
            ) : null}
            {/* no-tour-anchor: student page; live tours run in the teacher app */}
            <button
              type="button"
              onClick={piece?.onStart}
              disabled={!piece}
              className={PRIMARY_BTN}
            >
              {S.start}
            </button>
          </div>
        )}

        {view.mode === 'loading' && (
          <div className="flex justify-center py-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        )}

        {piece?.notice === 'open-failed' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center text-sm text-slate-700">
            <p>{S.openFailed}</p>
            {/* no-tour-anchor: student page; live tours run in the teacher app */}
            <button
              type="button"
              onClick={piece.onStart}
              className={SECONDARY_BTN}
            >
              {S.tryAgain}
            </button>
          </div>
        )}

        {view.mode === 'closed' && (
          <p className="text-sm font-semibold text-slate-700">{S.closed}</p>
        )}

        {view.mode === 'taken-over' && piece && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="flex min-w-0 items-start gap-3">
              <MonitorSmartphone
                className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue-primary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  {S.takenOverTitle}
                </p>
                <p className="text-sm text-slate-600">{S.takenOverBody}</p>
              </div>
            </div>
            {/* no-tour-anchor: student page; live tours run in the teacher app */}
            <button
              type="button"
              onClick={piece.onContinueHere}
              className={PRIMARY_BTN}
            >
              {S.continueHere}
            </button>
          </div>
        )}

        {piece?.unsent.map((u) => (
          <UnsentPanel
            key={u.savedAt}
            unsent={u}
            onCopy={piece.onUnsentCopy}
            onDismiss={() => piece.onDismissUnsent(u.savedAt)}
          />
        ))}

        {view.mode === 'writing' && view.status === 'revising' && (
          <p className="text-sm text-slate-700">{S.revising}</p>
        )}
        {view.mode === 'returned' && (
          <p className="text-sm text-slate-700">{S.returned}</p>
        )}
        {view.mode === 'writing' && piece && !piece.online && (
          <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            {S.offline}
          </div>
        )}

        {showEditor && (
          <div
            className={
              stimuli.length > 0
                ? 'flex flex-col gap-5 lg:flex-row lg:items-start'
                : undefined
            }
          >
            {stimuli.length > 0 && (
              <div className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-y-auto lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:w-[42%]">
                <StimulusTabsPanel
                  stimuli={stimuli}
                  light
                  renderStimulus={(s) => (
                    <StimulusRenderer stimulus={s} light fill />
                  )}
                />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-3">
              {editor}
              {view.saveState === 'failed' && (
                <p role="alert" className="text-sm font-semibold text-rose-700">
                  {S.notSavedBody}
                </p>
              )}
              {notice && (
                <p role="status" className="text-sm font-medium text-slate-700">
                  {notice}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SaveState view={view} />
                {view.showTurnIn && piece && (
                  <div className="flex flex-col items-end gap-1">
                    {/* no-tour-anchor: student page; live tours run in the teacher app */}
                    <button
                      type="button"
                      onClick={piece.onTurnIn}
                      disabled={
                        view.turnInBlockedBy !== null || piece.busy !== null
                      }
                      className={PRIMARY_BTN}
                    >
                      {piece.busy === 'turn-in' ? S.turningIn : S.turnIn}
                    </button>
                  </div>
                )}
                {view.mode === 'turned-in' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">
                      {S.turnedIn}
                    </span>
                    {view.showTakeBack && piece && (
                      // no-tour-anchor: student page; live tours run in the teacher app
                      <button
                        type="button"
                        onClick={piece.onTakeBack}
                        disabled={piece.busy !== null}
                        className={SECONDARY_BTN}
                      >
                        {piece.busy === 'take-back' ? S.takingBack : S.takeBack}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {wordMessage && (
                <p className="text-right text-sm font-medium text-rose-700">
                  {wordMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </StudentPageShell>
  );
};
