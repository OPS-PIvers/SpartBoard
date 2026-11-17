// Live view (D15): one student's piece in the Quiz Live view frame, with Nudge; only the session's teacher opens it.
import React, {
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import type { QuizNudgeNoteId, WritingAssignmentSession } from '@/types';
import { PromptText } from '@/components/common/PromptText';
import { tourTypeAttr } from '@/config/tourAnchors';
import { useDashboard } from '@/context/useDashboard';
import { AuthContext } from '@/context/AuthContextValue';
import { useQuizLiveViewAlwaysNotify } from '@/hooks/useQuizHandRaiseMode';
import { useServerNow } from '@/hooks/useServerNow';
import {
  LIVE_VIEW_NUDGE_FEATURE,
  LIVE_VIEW_NUDGE_NOTE_FEATURE,
  LIVE_VIEW_RENEW_MS,
  liveViewClock,
} from '@/utils/quizLiveView';
import { formatTimeLeft } from '@/utils/quizTimeLimit';
import { formatAwayDuration } from '@/utils/tabAwayLimit';
import { logError } from '@/utils/logError';
import { sanitizeQuizResponse } from '@/utils/security';
import {
  clearWritingLiveView,
  sendWritingNudge,
  stampWritingLiveView,
} from '@/utils/writingLiveViewStore';
import {
  LiveViewControls,
  LiveViewFrame,
  LiveViewStat,
} from '@/components/widgets/QuizWidget/components/monitor/LiveViewPanel';
import { savedAgo, type WritingMonitorRow } from '@/utils/writingMonitor';

const minutes = (ms: number): string => `${Math.round(ms / 60_000)} min`;

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
  // The Quiz Live view's admin settings apply here too.
  const auth = useContext(AuthContext);
  const alwaysNotify = useQuizLiveViewAlwaysNotify();
  const canNudge = auth?.canAccessFeature?.(LIVE_VIEW_NUDGE_FEATURE) === true;
  const canNudgeNote =
    canNudge && auth?.canAccessFeature?.(LIVE_VIEW_NUDGE_NOTE_FEATURE) === true;
  const [tell, setTell] = useState(false);
  const notify = alwaysNotify || tell;
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
    stampWritingLiveView(sessionId, studentKey, notify).catch((err: unknown) =>
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
    stampWritingLiveView(sessionId, studentKey, alwaysNotify || next).catch(
      (err: unknown) => logError('WritingLiveView.stamp', err, { sessionId })
    );
  };

  const onNudge = async () => {
    if (!watching || nudging || !canNudge) return;
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
  const summary = response?.summary;
  const saved = savedAgo(student?.savedAt ?? null, now);
  const deadline =
    typeof response?.deadlineAt === 'number' ? response.deadlineAt : null;
  const gone = !student || !response || !summary;

  return (
    <LiveViewFrame
      name={student?.name ?? 'Student'}
      onPrevious={prev ? () => onSelect(prev.key) : undefined}
      onNext={next ? () => onSelect(next.key) : undefined}
      onClose={onClose}
      anchors={{
        previous: tourTypeAttr('writing-live-view.previous', 'writing'),
        next: tourTypeAttr('writing-live-view.next', 'writing'),
        close: tourTypeAttr('writing-live-view.close', 'writing'),
      }}
      gone={
        gone
          ? {
              title: 'This student is no longer writing',
              line: 'Their work was turned in or has not started.',
            }
          : null
      }
      body={
        gone ? null : (
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
        )
      }
      aside={
        gone ? null : (
          <>
            <dl className="divide-y divide-slate-100">
              <LiveViewStat label="Started">
                {liveViewClock(response.startedAt)}
              </LiveViewStat>
              {deadline != null && (
                <LiveViewStat label="Time left">
                  {formatTimeLeft(deadline - now)}
                </LiveViewStat>
              )}
              <LiveViewStat label="Words">{summary.wordCount}</LiveViewStat>
              <LiveViewStat label="Time writing">
                {minutes(summary.writingMs)}
              </LiveViewStat>
              <LiveViewStat label="Time away">
                {summary.awayCount > 0
                  ? `${formatAwayDuration(summary.awayMs)}, ${summary.awayCount} time${summary.awayCount === 1 ? '' : 's'}`
                  : 'None'}
              </LiveViewStat>
            </dl>
            <LiveViewControls
              showTell={!alwaysNotify}
              tell={tell}
              onTell={onTell}
              notifyText={
                notify ? 'Your teacher is viewing your writing' : null
              }
              canNudge={canNudge}
              canNudgeNote={canNudgeNote}
              noteId={noteId}
              onNoteId={setNoteId}
              nudging={nudging}
              onNudge={() => void onNudge()}
              anchors={{
                tell: tourTypeAttr('writing-live-view.tell-student', 'writing'),
                note: tourTypeAttr('writing-live-view.nudge-note', 'writing'),
                nudge: tourTypeAttr('writing-live-view.nudge', 'writing'),
              }}
            />
          </>
        )
      }
    />
  );
};
