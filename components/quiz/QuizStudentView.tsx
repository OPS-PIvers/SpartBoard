import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type {
  QuizBehaviorSettings,
  QuizData,
  QuizResponse,
  QuizResponseAnswer,
  QuizSession,
  TabExit,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { Z_INDEX } from '@/config/zIndex';
import { countAnsweredQuestions } from '@/utils/quizCompleteness';
import {
  DEFAULT_TAB_WARNING_THRESHOLD,
  TAB_WARNING_THRESHOLD_MAX,
  TAB_WARNING_THRESHOLD_MIN,
} from '@/utils/tabWarningThreshold';
import {
  DEFAULT_TAB_AWAY_LIMIT_SECONDS,
  TAB_AWAY_LIMIT_PRESETS,
  clampTabAwaySeconds,
} from '@/utils/tabAwayLimit';
import {
  buildStudentViewSession,
  focusSettingsFrom,
  withFocusSettings,
  type StudentViewFocusSettings,
} from '@/utils/quizStudentViewSession';
import { ActiveQuiz, QuizSubmittedWaitScreen } from './QuizStudentApp';

interface QuizStudentViewProps {
  quiz: QuizData;
  behavior: QuizBehaviorSettings;
  /** Mirrors Assign: the away limit exists only with the tab-away-timer flag. */
  tabAwayTimerOn: boolean;
  onExit: () => void;
}

const STUDENT_VIEW_UID = 'student-view';

const sameFocus = (a: StudentViewFocusSettings, b: StudentViewFocusSettings) =>
  (a.tabWarningsEnabled ?? true) === (b.tabWarningsEnabled ?? true) &&
  (a.tabWarningThreshold ?? DEFAULT_TAB_WARNING_THRESHOLD) ===
    (b.tabWarningThreshold ?? DEFAULT_TAB_WARNING_THRESHOLD) &&
  (a.tabAwayAutoSubmit === true) === (b.tabAwayAutoSubmit === true) &&
  (a.tabAwayAutoSubmit !== true ||
    clampTabAwaySeconds(
      a.tabAwayLimitSeconds ?? DEFAULT_TAB_AWAY_LIMIT_SECONDS
    ) ===
      clampTabAwaySeconds(
        b.tabAwayLimitSeconds ?? DEFAULT_TAB_AWAY_LIMIT_SECONDS
      )) &&
  (a.blockCopyPaste ?? false) === (b.blockCopyPaste ?? false);

/** Teacher-only full-screen run of the real student player; nothing is written anywhere. */
export const QuizStudentView: React.FC<QuizStudentViewProps> = ({
  quiz,
  behavior,
  tabAwayTimerOn,
  onExit,
}) => {
  const saved = useMemo(() => focusSettingsFrom(behavior), [behavior]);
  const [focus, setFocus] = useState<StudentViewFocusSettings>(saved);
  const [run, setRun] = useState(0);
  const base = useMemo(
    () => buildStudentViewSession(quiz, behavior, tabAwayTimerOn),
    [quiz, behavior, tabAwayTimerOn]
  );
  const session = useMemo(
    () => withFocusSettings(base, focus, tabAwayTimerOn),
    [base, focus, tabAwayTimerOn]
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student view"
      className="fixed inset-0 flex flex-col bg-white"
      style={{ zIndex: Z_INDEX.modalDeep }}
    >
      <StudentViewToolbar
        focus={focus}
        onChange={(next) => setFocus((prev) => ({ ...prev, ...next }))}
        showAwayLimit={tabAwayTimerOn}
        changed={!sameFocus(focus, saved)}
        onReset={() => setFocus(saved)}
        onRestart={() => setRun((n) => n + 1)}
        onExit={onExit}
      />
      {/* translateZ makes this the containing block, so the player's fixed overlays stay under the toolbar. */}
      <div className="relative flex-1 overflow-y-auto [transform:translateZ(0)]">
        <StudentViewAttempt key={run} session={session} />
      </div>
    </div>,
    document.body
  );
};

const StudentViewAttempt: React.FC<{ session: QuizSession }> = ({
  session,
}) => {
  const [response, setResponse] = useState<QuizResponse>(() => ({
    studentUid: STUDENT_VIEW_UID,
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    tabSwitchWarnings: 0,
    tabExits: [],
    completedAttempts: 0,
  }));
  const warningsRef = useRef(0);
  const [noticeAckedAt, setNoticeAckedAt] = useState<number | null>(null);

  const onAnswer = useCallback(
    (
      questionId: string,
      answer: string,
      speedBonus?: number,
      opts?: { isDraft?: boolean }
    ) => {
      const entry: QuizResponseAnswer = {
        questionId,
        answer,
        answeredAt: Date.now(),
        status: opts?.isDraft ? 'draft' : 'submitted',
        ...(speedBonus !== undefined ? { speedBonus } : {}),
      };
      setResponse((r) => ({
        ...r,
        answers: [
          ...r.answers.filter((a) => a.questionId !== questionId),
          entry,
        ],
      }));
      return Promise.resolve();
    },
    []
  );
  const onComplete = useCallback(() => {
    setResponse((r) => ({
      ...r,
      status: 'completed',
      submittedAt: Date.now(),
    }));
    return Promise.resolve();
  }, []);
  const reportTabSwitch = useCallback(() => {
    warningsRef.current += 1;
    const total = warningsRef.current;
    setResponse((r) => ({ ...r, tabSwitchWarnings: total }));
    return Promise.resolve(total);
  }, []);
  const saveTabExits = useCallback((tabExits: TabExit[]) => {
    setResponse((r) => ({ ...r, tabExits }));
    return Promise.resolve();
  }, []);
  const noop = useCallback(() => Promise.resolve(), []);

  if (response.status === 'completed') {
    return (
      <QuizSubmittedWaitScreen
        session={session}
        myResponse={response}
        pin=""
        answeredCount={countAnsweredQuestions(
          response.answers,
          session.publicQuestions.map((q) => q.id)
        )}
        hideReturnButton
      />
    );
  }

  const currentQ = session.publicQuestions[session.currentQuestionIndex];
  return (
    <ActiveQuiz
      session={session}
      currentQuestion={currentQ}
      alreadyAnswered={false}
      myResponse={response}
      onAnswer={onAnswer}
      onCommitRecording={noop}
      onRetryRecordingUpload={noop}
      canRetryRecordingUpload={() => false}
      onMarkUnresponded={noop}
      noticeAckedAt={noticeAckedAt}
      onAcknowledgeNotice={() => setNoticeAckedAt(Date.now())}
      onComplete={onComplete}
      reportTabSwitch={reportTabSwitch}
      saveTabExits={saveTabExits}
      onSetHandRaised={noop}
      handRaised={false}
      warningCount={response.tabSwitchWarnings ?? 0}
      onRecordStimulusPlay={noop}
      onReportStimulusError={noop}
    />
  );
};

const divider = 'flex items-center gap-1.5 border-l border-slate-700 pl-2';

const StudentViewToolbar: React.FC<{
  focus: StudentViewFocusSettings;
  onChange: (next: Partial<StudentViewFocusSettings>) => void;
  showAwayLimit: boolean;
  changed: boolean;
  onReset: () => void;
  onRestart: () => void;
  onExit: () => void;
}> = ({
  focus,
  onChange,
  showAwayLimit,
  changed,
  onReset,
  onRestart,
  onExit,
}) => {
  const focusOn = focus.tabWarningsEnabled ?? true;
  const threshold = focus.tabWarningThreshold ?? DEFAULT_TAB_WARNING_THRESHOLD;
  const awaySeconds = clampTabAwaySeconds(
    focus.tabAwayLimitSeconds ?? DEFAULT_TAB_AWAY_LIMIT_SECONDS
  );
  const awayOn = focus.tabAwayAutoSubmit === true;
  const presets: number[] = [...TAB_AWAY_LIMIT_PRESETS];
  if (awayOn && !presets.includes(awaySeconds)) {
    presets.push(awaySeconds);
    presets.sort((a, b) => a - b);
  }
  const stepThreshold = (delta: number) => {
    if (threshold === 'off') {
      if (delta > 0)
        onChange({ tabWarningThreshold: TAB_WARNING_THRESHOLD_MIN });
      return;
    }
    const next = threshold + delta;
    if (next < TAB_WARNING_THRESHOLD_MIN) {
      onChange({ tabWarningThreshold: 'off' });
      return;
    }
    onChange({
      tabWarningThreshold: Math.min(TAB_WARNING_THRESHOLD_MAX, next),
    });
  };
  const presetLabel = (s: number) =>
    s < 60
      ? `${s}s`
      : s % 60
        ? `${Math.floor(s / 60)}m ${s % 60}s`
        : `${s / 60}m`;
  const segment = (active: boolean) =>
    `px-1.5 py-0.5 ${active ? 'bg-white font-bold text-slate-900' : 'bg-slate-800 hover:bg-slate-700'}`;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap bg-slate-900 px-3 text-xs text-slate-300">
      <div className="flex items-center gap-1.5 border-r border-slate-700 pr-2 font-bold text-white">
        <Eye className="h-4 w-4" aria-hidden />
        Student view
      </div>
      <label className="flex items-center gap-2 font-semibold text-white">
        <Toggle
          checked={focusOn}
          onChange={(v) => onChange({ tabWarningsEnabled: v })}
          size="xs"
          variant="transparent"
          activeColor="bg-emerald-500"
          showLabels={false}
          label="Focus mode"
        />
        Focus mode
      </label>
      {focusOn && (
        <div className={divider}>
          <span>Auto-submit after</span>
          <div className="flex items-center rounded-md border border-slate-700 bg-slate-800">
            <button
              type="button"
              onClick={() => stepThreshold(-1)}
              disabled={threshold === 'off'}
              aria-label="Fewer switches"
              className="px-1.5 py-0.5 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[1.5rem] text-center font-bold text-white">
              {threshold === 'off' ? 'Off' : threshold}
            </span>
            <button
              type="button"
              onClick={() => stepThreshold(1)}
              disabled={threshold === TAB_WARNING_THRESHOLD_MAX}
              aria-label="More switches"
              className="px-1.5 py-0.5 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {threshold !== 'off' && <span>switches</span>}
        </div>
      )}
      {focusOn && showAwayLimit && (
        <div className={divider}>
          <span id="student-view-away-limit">Away limit</span>
          <div
            role="radiogroup"
            aria-labelledby="student-view-away-limit"
            className="flex overflow-hidden rounded-md border border-slate-700"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!awayOn}
              onClick={() =>
                onChange({
                  tabAwayAutoSubmit: false,
                  tabAwayLimitSeconds: awaySeconds,
                })
              }
              className={segment(!awayOn)}
            >
              Off
            </button>
            {presets.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={awayOn && awaySeconds === s}
                onClick={() =>
                  onChange({ tabAwayAutoSubmit: true, tabAwayLimitSeconds: s })
                }
                className={segment(awayOn && awaySeconds === s)}
              >
                {presetLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className={`${divider} gap-2`}>
        <Toggle
          checked={focus.blockCopyPaste ?? false}
          onChange={(v) => onChange({ blockCopyPaste: v })}
          size="xs"
          variant="transparent"
          activeColor="bg-emerald-500"
          showLabels={false}
          label="Block copy & paste"
        />
        Block copy &amp; paste
      </label>
      <div className="ml-auto flex items-center gap-2 pl-2">
        {changed && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-amber-400 px-2 py-1 font-semibold text-amber-300 hover:bg-amber-400/10"
          >
            Reset to quiz settings
          </button>
        )}
        <button
          type="button"
          onClick={onRestart}
          className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Restart
        </button>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-bold text-slate-900 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Exit
        </button>
      </div>
    </div>
  );
};
