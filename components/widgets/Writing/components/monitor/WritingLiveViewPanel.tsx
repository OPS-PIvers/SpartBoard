// Live view (D15): one student's piece, redrawn from the saved response, with Nudge; only the session's teacher opens it.
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import type { QuizNudgeNoteId, WritingAssignmentSession } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { PromptText } from '@/components/common/PromptText';
import { Z_INDEX } from '@/config/zIndex';
import { tourTypeAttr } from '@/config/tourAnchors';
import { useDashboard } from '@/context/useDashboard';
import { useServerNow } from '@/hooks/useServerNow';
import { LIVE_VIEW_RENEW_MS } from '@/utils/quizLiveView';
import { NUDGE_NOTE_IDS, NUDGE_NOTE_TEXT } from '@/utils/quizNudgeNotes';
import { formatTimeLeft } from '@/utils/quizTimeLimit';
import { formatAwayDuration } from '@/utils/tabAwayLimit';
import { logError } from '@/utils/logError';
import { sanitizeQuizResponse } from '@/utils/security';
import {
  clearWritingLiveView,
  sendWritingNudge,
  stampWritingLiveView,
} from '@/utils/writingLiveViewStore';
import { savedAgo, type WritingMonitorRow } from '@/utils/writingMonitor';

const clock = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const minutes = (ms: number): string => `${Math.round(ms / 60_000)} min`;

const Stat: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-semibold tabular-nums text-slate-800">
      {children}
    </dd>
  </div>
);

export const WritingLiveViewPanel: React.FC<{
  session: WritingAssignmentSession;
  /** Students who can still write, in list order, for previous and next. */
  students: WritingMonitorRow[];
  studentKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}> = ({ session, students, studentKey, onSelect, onClose }) => {
  const { addToast } = useDashboard();
  const now = useServerNow(1000);
  const [tell, setTell] = useState(false);
  const [noteId, setNoteId] = useState<QuizNudgeNoteId | ''>('');
  const [nudging, setNudging] = useState(false);

  const index = students.findIndex((s) => s.key === studentKey);
  const student = index >= 0 ? students[index] : undefined;
  const response = student?.response ?? null;
  const watching = !!response;
  const sessionId = session.id;
  const html = useMemo(
    () => sanitizeQuizResponse(response?.html ?? ''),
    [response?.html]
  );

  const stamp = useEffectEvent(() => {
    stampWritingLiveView(sessionId, studentKey, tell).catch((err: unknown) =>
      logError('WritingLiveView.stamp', err, { sessionId })
    );
  });
  const closeOnEscape = useEffectEvent(() => onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOnEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // The stamp makes this one student's page save every few seconds; clearing it on close stops that.
  useEffect(() => {
    if (!watching) return;
    stamp();
    const renew = window.setInterval(stamp, LIVE_VIEW_RENEW_MS);
    return () => {
      window.clearInterval(renew);
      clearWritingLiveView(sessionId, studentKey).catch((err: unknown) =>
        logError('WritingLiveView.clear', err, { sessionId })
      );
    };
  }, [watching, sessionId, studentKey]);

  const onTell = (next: boolean) => {
    setTell(next);
    if (!watching) return;
    stampWritingLiveView(sessionId, studentKey, next).catch((err: unknown) =>
      logError('WritingLiveView.stamp', err, { sessionId })
    );
  };

  const onNudge = async () => {
    if (!watching || nudging) return;
    setNudging(true);
    try {
      await sendWritingNudge(sessionId, studentKey, noteId || undefined);
      addToast('Nudge sent.', 'success');
    } catch (err) {
      logError('WritingLiveView.nudge', err, { sessionId });
      addToast('Could not send the Nudge. Try again.', 'error');
    } finally {
      setNudging(false);
    }
  };

  const prev = index > 0 ? students[index - 1] : undefined;
  // A student who turned in leaves the list; Next then starts from the top.
  const next = index < students.length - 1 ? students[index + 1] : undefined;
  const navButton =
    'flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent';
  const summary = response?.summary;
  const saved = savedAgo(student?.savedAt ?? null, now);
  const deadline =
    typeof response?.deadlineAt === 'number' ? response.deadlineAt : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live view"
      className="fixed inset-0 flex flex-col bg-slate-100"
      style={{ zIndex: Z_INDEX.modalDeep }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap bg-slate-900 px-3 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 border-r border-slate-700 pr-2 font-bold text-white">
          <Eye className="h-4 w-4" aria-hidden />
          Live view
        </div>
        <span className="truncate text-sm font-semibold text-white">
          {student?.name ?? 'Student'}
        </span>
        <div className="ml-auto flex items-center gap-1 pl-2">
          <button
            type="button"
            {...tourTypeAttr('writing-live-view.previous', 'writing')}
            onClick={() => prev && onSelect(prev.key)}
            disabled={!prev}
            className={navButton}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Previous
          </button>
          <button
            type="button"
            {...tourTypeAttr('writing-live-view.next', 'writing')}
            onClick={() => next && onSelect(next.key)}
            disabled={!next}
            className={navButton}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            {...tourTypeAttr('writing-live-view.close', 'writing')}
            onClick={onClose}
            className="ml-1 flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-bold text-slate-900 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Close
          </button>
        </div>
      </div>

      {!student || !response || !summary ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="text-base font-semibold text-slate-800">
            This student is no longer writing
          </p>
          <p className="text-sm text-slate-600">
            Their work was turned in or has not started.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="min-h-[45%] flex-1 overflow-y-auto bg-white pb-8 md:min-h-0">
            <p className="flex flex-wrap items-center gap-x-2 border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">
                {student.name}
              </span>
              {saved && <span>{saved}</span>}
              <span className="ml-auto">
                Teacher&apos;s Live view, not the student&apos;s screen
              </span>
            </p>
            <div className="mx-auto max-w-3xl px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {session.title}
              </h3>
              <div className="mt-2 border-b border-slate-200 pb-3 text-sm text-slate-700">
                <PromptText text={session.prompt} />
              </div>
              {html ? (
                <div
                  className="mt-4 text-base leading-relaxed text-slate-900 [&_p]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <p className="mt-4 text-sm text-slate-500">No writing yet.</p>
              )}
            </div>
          </div>

          <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 pb-8 text-sm md:w-80 md:border-l md:border-t-0">
            <dl className="divide-y divide-slate-100">
              <Stat label="Started">{clock(response.startedAt)}</Stat>
              {deadline != null && (
                <Stat label="Time left">{formatTimeLeft(deadline - now)}</Stat>
              )}
              <Stat label="Words">{summary.wordCount}</Stat>
              <Stat label="Time writing">{minutes(summary.writingMs)}</Stat>
              <Stat label="Time away">
                {summary.awayCount > 0
                  ? `${formatAwayDuration(summary.awayMs)}, ${summary.awayCount} time${summary.awayCount === 1 ? '' : 's'}`
                  : 'None'}
              </Stat>
            </dl>

            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <label className="flex items-center justify-between gap-3 font-semibold text-slate-800">
                Notify student when viewing
                <span
                  {...tourTypeAttr('writing-live-view.tell-student', 'writing')}
                >
                  <Toggle
                    checked={tell}
                    onChange={onTell}
                    size="sm"
                    showLabels={false}
                    label="Notify student when viewing"
                  />
                </span>
              </label>
              {tell && (
                <p className="text-xs text-slate-600">
                  The student sees &quot;Your teacher is viewing your
                  writing&quot;.
                </p>
              )}
              <div className="flex items-center gap-2">
                <select
                  {...tourTypeAttr('writing-live-view.nudge-note', 'writing')}
                  aria-label="Nudge note"
                  value={noteId}
                  onChange={(e) =>
                    setNoteId(e.target.value as QuizNudgeNoteId | '')
                  }
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
                >
                  <option value="">No note</option>
                  {NUDGE_NOTE_IDS.map((id) => (
                    <option key={id} value={id}>
                      {NUDGE_NOTE_TEXT[id]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  {...tourTypeAttr('writing-live-view.nudge', 'writing')}
                  onClick={() => void onNudge()}
                  disabled={nudging}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-brand-blue-primary px-3 font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-60"
                >
                  <BellRing className="h-4 w-4" aria-hidden />
                  Nudge
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>,
    document.body
  );
};
