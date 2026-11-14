import React, {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  BellRing,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  X,
} from 'lucide-react';
import type {
  QuizLiveLogEntry,
  QuizLiveState,
  QuizNudgeNoteId,
  QuizSession,
  StudentOverride,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { Z_INDEX } from '@/config/zIndex';
import { tourTypeAttr } from '@/config/tourAnchors';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useQuizLiveViewAlwaysNotify } from '@/hooks/useQuizHandRaiseMode';
import { useServerNow } from '@/hooks/useServerNow';
import { ActiveQuiz } from '@/components/quiz/QuizStudentApp';
import { RecordingNoticeDrawingContext } from '@/components/quiz/recording/recordingNoticeDrawing';
import { snapshotFontEmbedCss } from '@/components/tours/snapshotFonts';
import { logError } from '@/utils/logError';
import {
  LIVE_VIEW_RENEW_MS,
  liveViewResponse,
  liveViewSession,
  liveViewStats,
  newestAnswerQuestionId,
  liveViewDrawIds,
  studentQuestionOrder,
} from '@/utils/quizLiveView';
import {
  addLiveLogEntry,
  clearLiveView,
  deleteLiveState,
  loadLiveLog,
  sendNudge,
  stampLiveView,
  watchLiveState,
} from '@/utils/quizLiveViewStore';
import { formatTimeLeft } from '@/utils/quizTimeLimit';
import { NUDGE_NOTE_IDS, NUDGE_NOTE_TEXT } from '@/utils/quizNudgeNotes';
import { noticeDrawingForSession } from '@/utils/quizWhiteboardSession';
import { getServerNow } from '@/utils/serverTime';
import { formatAwayDuration } from '@/utils/tabAwayLimit';
import type { MonitorStudent } from './useMonitorData';
import { LiveLogList } from './LiveLogList';

interface LiveViewPanelProps {
  session: QuizSession;
  /** In-progress students, in roster order, for previous and next. */
  students: MonitorStudent[];
  studentKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  overridesByStudentUid?: Record<string, StudentOverride> | null;
}

const noop = () => Promise.resolve();
const noTabSwitch = () => Promise.resolve(0);
const neverRetry = () => false;
const SCREENSHOT_FOLDER = 'Quiz Live View';

const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

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

/** One student's in-progress attempt, redrawn from saved data; only the assigning teacher opens it. */
export const LiveViewPanel: React.FC<LiveViewPanelProps> = ({
  session,
  students,
  studentKey,
  onSelect,
  onClose,
  overridesByStudentUid,
}) => {
  const { addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const alwaysNotify = useQuizLiveViewAlwaysNotify();
  const [tell, setTell] = useState(false);
  const notify = alwaysNotify || tell;
  const now = useServerNow(1000);

  const index = students.findIndex((s) => s.key === studentKey);
  const student = index >= 0 ? students[index] : undefined;
  const sessionId = session.id;
  const teacherUid = session.teacherUid;
  const assignmentId = session.assignmentId || session.id;
  const watching = !!student;

  const [live, setLive] = useState<{
    key: string;
    state: QuizLiveState | null;
  } | null>(null);
  const [log, setLog] = useState<{
    key: string;
    entries: QuizLiveLogEntry[];
  }>({ key: studentKey, entries: [] });
  const entries = log.key === studentKey ? log.entries : [];

  const response = student?.response;
  const override = response
    ? overridesByStudentUid?.[response.studentUid]
    : undefined;
  const reported = live?.key === studentKey ? live.state : null;
  const questionId =
    reported?.questionId ??
    (response ? newestAnswerQuestionId(response) : null);
  const stats = useMemo(
    () =>
      response
        ? liveViewStats(session, response, questionId, now, override)
        : null,
    [session, response, questionId, now, override]
  );

  const record = useCallback(
    async (entry: Omit<QuizLiveLogEntry, 'id' | 'responseKey' | 'at'>) => {
      try {
        const saved = await addLiveLogEntry(teacherUid, assignmentId, {
          ...entry,
          responseKey: studentKey,
          at: getServerNow(),
        });
        setLog((prev) =>
          prev.key === studentKey
            ? { key: studentKey, entries: [...prev.entries, saved] }
            : prev
        );
      } catch (err) {
        logError('QuizLiveView.log', err, { assignmentId });
      }
    },
    [teacherUid, assignmentId, studentKey]
  );
  const place = () => ({
    ...(questionId ? { questionId } : {}),
    ...(stats?.questionNumber ? { questionNumber: stats.questionNumber } : {}),
  });

  const stamp = useEffectEvent(() => {
    stampLiveView(sessionId, studentKey, notify).catch((err: unknown) =>
      logError('QuizLiveView.stamp', err, { sessionId })
    );
  });
  // Opening with the banner on is logged once, alongside the student's earlier entries.
  const openLog = useEffectEvent(async (): Promise<QuizLiveLogEntry[]> => {
    const banner = notify
      ? await addLiveLogEntry(teacherUid, assignmentId, {
          kind: 'banner',
          responseKey: studentKey,
          at: getServerNow(),
          ...place(),
        }).catch(() => null)
      : null;
    const loaded = await loadLiveLog(teacherUid, assignmentId, studentKey);
    return banner && !loaded.some((e) => e.id === banner.id)
      ? [...loaded, banner]
      : loaded;
  });
  const closeOnEscape = useEffectEvent(() => onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOnEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // The stamp tells this one student's page to report its question; clearing it on close stops that.
  useEffect(() => {
    if (!watching) return;
    stamp();
    const renew = window.setInterval(stamp, LIVE_VIEW_RENEW_MS);
    const stop = watchLiveState(sessionId, studentKey, (state) =>
      setLive({ key: studentKey, state })
    );
    let stale = false;
    openLog()
      .then((loaded) => {
        if (!stale) setLog({ key: studentKey, entries: loaded });
      })
      .catch((err: unknown) =>
        logError('QuizLiveView.loadLog', err, { assignmentId })
      );
    return () => {
      stale = true;
      window.clearInterval(renew);
      stop();
      clearLiveView(sessionId, studentKey).catch((err: unknown) =>
        logError('QuizLiveView.clear', err, { sessionId })
      );
      // The next open starts from a fresh report, and nothing is left behind.
      deleteLiveState(sessionId, studentKey).catch(() => undefined);
    };
  }, [watching, sessionId, studentKey, assignmentId]);

  const onTell = (next: boolean) => {
    setTell(next);
    if (!watching) return;
    stampLiveView(sessionId, studentKey, alwaysNotify || next).catch(
      (err: unknown) => logError('QuizLiveView.stamp', err, { sessionId })
    );
    if (next) void record({ kind: 'banner', ...place() });
  };

  const [noteId, setNoteId] = useState<QuizNudgeNoteId | ''>('');
  const [nudging, setNudging] = useState(false);
  const onNudge = async () => {
    if (!watching || nudging) return;
    setNudging(true);
    try {
      await sendNudge(sessionId, studentKey, noteId || undefined);
      await record({
        kind: 'nudge',
        ...(noteId ? { noteId } : {}),
        ...place(),
      });
      addToast('Nudge sent.', 'success');
    } catch (err) {
      logError('QuizLiveView.nudge', err, { sessionId });
      addToast('Could not send the Nudge. Try again.', 'error');
    } finally {
      setNudging(false);
    }
  };

  const shotRef = useRef<HTMLDivElement | null>(null);
  const [shotAt, setShotAt] = useState<number | null>(null);
  const onScreenshot = async () => {
    const node = shotRef.current;
    if (!node || !student || shotAt != null) return;
    if (!driveService) {
      addToast('Connect Google Drive to save screenshots.', 'error');
      return;
    }
    const at = getServerNow();
    setShotAt(at);
    try {
      // One frame so the caption carries the capture time.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        fontEmbedCSS: await snapshotFontEmbedCss(document),
      });
      if (!blob) throw new Error('Empty screenshot');
      // Private to the teacher: uploaded with no sharing step.
      const file = await driveService.uploadFile(
        blob,
        `Live view - ${student.name} - ${new Date(at).toISOString().slice(0, 19).replace('T', ' ')}.png`,
        SCREENSHOT_FOLDER
      );
      await record({ kind: 'screenshot', driveFileId: file.id, ...place() });
      addToast('Screenshot saved to your Drive.', 'success');
    } catch (err) {
      logError('QuizLiveView.screenshot', err, { sessionId });
      addToast('Could not save the screenshot. Try again.', 'error');
    } finally {
      setShotAt(null);
    }
  };

  const mirrorSession = useMemo(() => liveViewSession(session), [session]);
  const mirrorResponse = useMemo(
    () => (response ? liveViewResponse(response) : null),
    [response]
  );
  const firstQuestionId = useMemo(
    () =>
      response
        ? (studentQuestionOrder(session, response, override)[0]?.id ?? null)
        : null,
    [session, response, override]
  );
  const prev = index > 0 ? students[index - 1] : undefined;
  const next =
    index >= 0 && index < students.length - 1 ? students[index + 1] : undefined;
  const navButton =
    'flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent';

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
            {...tourTypeAttr('quiz-live-view.previous', 'quiz')}
            onClick={() => prev && onSelect(prev.key)}
            disabled={!prev}
            className={navButton}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Previous
          </button>
          <button
            type="button"
            {...tourTypeAttr('quiz-live-view.next', 'quiz')}
            onClick={() => next && onSelect(next.key)}
            disabled={!next}
            className={navButton}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            {...tourTypeAttr('quiz-live-view.close', 'quiz')}
            onClick={onClose}
            className="ml-1 flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-bold text-slate-900 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Close
          </button>
        </div>
      </div>

      {!student || !mirrorResponse || !stats ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="text-base font-semibold text-slate-800">
            This student is no longer in progress
          </p>
          <p className="text-sm text-slate-600">
            Open Results to see a turned-in attempt.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* translateZ pins the player's fixed overlays to this frame; the scroller is outside the inert copy so it still scrolls. */}
          <div className="relative min-h-[45%] flex-1 transform-[translateZ(0)] md:min-h-0">
            <div className="absolute inset-0 overflow-y-auto bg-white pb-8">
              <div ref={shotRef} className="min-h-full bg-white">
                <p className="flex flex-wrap items-center gap-x-2 border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">
                    {student.name}
                  </span>
                  {stats.questionNumber != null && (
                    <span>Question {stats.questionNumber}</span>
                  )}
                  {shotAt != null && (
                    <span>{new Date(shotAt).toLocaleString()}</span>
                  )}
                  <span className="ml-auto">
                    Teacher&apos;s Live view, not the student&apos;s screen
                  </span>
                </p>
                <div
                  inert
                  className="[&>.h-screen]:h-auto [&>.h-screen]:overflow-visible"
                >
                  <RecordingNoticeDrawingContext.Provider
                    value={noticeDrawingForSession(
                      mirrorSession,
                      mirrorSession.publicQuestions
                    )}
                  >
                    <ActiveQuiz
                      key={`${studentKey}:${response?.completedAttempts ?? 0}`}
                      session={mirrorSession}
                      currentQuestion={undefined}
                      alreadyAnswered={false}
                      myResponse={mirrorResponse}
                      onAnswer={noop}
                      onCommitRecording={noop}
                      onCommitWhiteboard={noop}
                      onRetryRecordingUpload={noop}
                      canRetryRecordingUpload={neverRetry}
                      onMarkUnresponded={noop}
                      noticeAckedAt={0}
                      onAcknowledgeNotice={() => undefined}
                      noticeRequired={false}
                      onComplete={noop}
                      reportTabSwitch={noTabSwitch}
                      onSetHandRaised={noop}
                      handRaised={false}
                      warningCount={0}
                      onRecordStimulusPlay={noop}
                      onReportStimulusError={noop}
                      override={override}
                      drawIds={liveViewDrawIds(session, response)}
                      watchQuestionId={questionId ?? firstQuestionId}
                    />
                  </RecordingNoticeDrawingContext.Provider>
                </div>
              </div>
            </div>
          </div>

          <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 pb-8 text-sm md:w-80 md:border-l md:border-t-0">
            <dl className="divide-y divide-slate-100">
              <Stat label="Started">{clock(stats.startedAt)}</Stat>
              {stats.deadline != null && (
                <Stat label="Time left">
                  {formatTimeLeft(stats.deadline - now)}
                </Stat>
              )}
              <Stat label="On question">
                {stats.questionNumber != null
                  ? `${stats.questionNumber} of ${stats.questionCount}`
                  : 'Not known yet'}
              </Stat>
              {reported && (
                <Stat label="Time on this question">
                  {formatAwayDuration(now - reported.at)}
                </Stat>
              )}
              <Stat label="Answered">
                {stats.answeredCount} of {stats.questionCount}
              </Stat>
              {stats.lastActivityAt != null && (
                <Stat label="Last activity">
                  {formatAwayDuration(now - stats.lastActivityAt)} ago
                </Stat>
              )}
              <Stat label="Tab exits">
                {stats.tabExits}
                {stats.tabExits > 0 &&
                  `, ${formatAwayDuration(stats.awayMs)} away`}
              </Stat>
              {stats.input ? (
                <>
                  <Stat label="Keys typed">{stats.input.keys}</Stat>
                  <Stat label="Pastes">
                    {stats.input.pastes}
                    {stats.input.pastedChars > 0 &&
                      `, ${stats.input.pastedChars} characters`}
                  </Stat>
                  <Stat label="Deletions">{stats.input.deletions}</Stat>
                  <Stat label="Clicks">{stats.input.clicks}</Stat>
                </>
              ) : (
                <Stat label="Input tracking">Off</Stat>
              )}
            </dl>

            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              {!alwaysNotify && (
                <label className="flex items-center justify-between gap-3 font-semibold text-slate-800">
                  Tell the student
                  <span
                    {...tourTypeAttr('quiz-live-view.tell-student', 'quiz')}
                  >
                    <Toggle
                      checked={tell}
                      onChange={onTell}
                      size="sm"
                      showLabels={false}
                      label="Tell the student"
                    />
                  </span>
                </label>
              )}
              {notify && (
                <p className="text-xs text-slate-600">
                  The student sees &quot;Your teacher is viewing your
                  quiz&quot;.
                </p>
              )}
              <div className="flex items-center gap-2">
                <select
                  {...tourTypeAttr('quiz-live-view.nudge-note', 'quiz')}
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
                  {...tourTypeAttr('quiz-live-view.nudge', 'quiz')}
                  onClick={() => void onNudge()}
                  disabled={nudging}
                  className="flex min-h-11 items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-60"
                >
                  <BellRing className="h-4 w-4" aria-hidden />
                  Nudge
                </button>
              </div>
              <button
                type="button"
                {...tourTypeAttr('quiz-live-view.screenshot', 'quiz')}
                onClick={() => void onScreenshot()}
                disabled={shotAt != null}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                {shotAt != null ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Camera className="h-4 w-4" aria-hidden />
                )}
                Screenshot
              </button>
            </div>

            {entries.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Live view log
                </h3>
                <LiveLogList entries={entries} />
              </div>
            )}
          </aside>
        </div>
      )}
    </div>,
    document.body
  );
};
