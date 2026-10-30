/**
 * SessionViewsDevHarness — DEV-only visual harness for the four live teacher
 * session views (Quiz Monitor / Quiz Results / Video Activity Monitor /
 * Video Activity Results).
 *
 * These views are Firestore- and Drive-backed in production, which makes it
 * slow to iterate on their redesign with realistic data. This harness mounts
 * the REAL view components (no forks, no copies) inside the same provider
 * stack the teacher app uses, against the fixtures in `sessionViewsMocks.ts`,
 * inside a `container-type: size` box so cqmin scaling can be checked at the
 * widget sizes that matter.
 *
 * The provider stack relies on auth-bypass: set `VITE_AUTH_BYPASS='true'` in
 * the dev environment so AuthProvider mounts a mock admin user and skips the
 * Firestore permission listeners (see context/AuthContext.tsx).
 *
 * Mounted at /session-views-dev in DEV builds only (same gating pattern as
 * LibraryDevHarness) — excluded from production bundles.
 */

import React, { useState } from 'react';
import { DialogProvider } from '@/context/DialogContext';
import { AuthProvider } from '@/context/AuthContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import { SavedWidgetsProvider } from '@/context/SavedWidgetsContext';
import { DashboardProvider } from '@/context/DashboardContext';
import { QuizLiveMonitor } from '@/components/widgets/QuizWidget/components/QuizLiveMonitor';
import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';
import { QuizAttemptSourceContext } from '@/hooks/useQuizResponseAttempts';
import { VideoActivityLiveMonitor } from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor';
import { Results as VideoActivityResults } from '@/components/widgets/VideoActivityWidget/components/Results';
import { toVideoActivityPublicQuestion } from '@/utils/videoActivityPublicQuestions';
import type {
  VideoActivityPublicQuestion,
  VideoActivityQuestion,
} from '@/types';
import { PresentScreen } from '@/components/widgets/QuizWidget/components/present/PresentScreen';
import { AudioCaptureDevView } from './AudioCaptureDevView';
import { RecordingControlsDevView } from './RecordingControlsDevView';
import { QuizEditorDevView } from './QuizEditorDevView';
import { MediaGradingDevView } from './MediaGradingDevView';
import { ResultsPlaybackDevView } from './ResultsPlaybackDevView';
import { StudentQuizDevView } from './StudentQuizDevView';
import {
  VIEWS,
  STATES,
  type ViewKey,
  type StateKey,
} from './sessionViewsStateOptions';
import {
  NOW,
  makeQuizSession,
  makeQuizResponses,
  makeQuizAttemptCopies,
  makeTimedQuizSession,
  makeTimedQuizResponses,
  makeStopQuizSession,
  makeStopQuizResponses,
  makeReviewGameResponses,
  makeReviewGameSession,
  makeQuizData,
  makeQuizConfig,
  makeVaSession,
  makeVaResponses,
  makeVaMultiClassSession,
  makeVaMultiClassResponses,
} from './sessionViewsMocks';
import {
  AUDIO_CAPTURE_STATES,
  AUDIO_CAPTURE_DARK_STATES,
  type AudioCaptureStateKey,
  RECORDING_CONTROL_STATES,
  type RecordingControlStateKey,
  QUIZ_EDITOR_STATES,
  type QuizEditorStateKey,
  MEDIA_GRADING_STATES,
  type MediaGradingStateKey,
  RESULTS_PLAYBACK_STATES,
  type ResultsPlaybackStateKey,
  STUDENT_QUIZ_STATES,
  type StudentQuizStateKey,
  VA_STUDENT_STATES,
  type VaStudentStateKey,
} from './devViewStates';
import { VaStudentAnswerDevView } from './VaStudentAnswerDevView';

// Picking a view moves the State select onto a key that view actually reads.
const DEFAULT_STATE_FOR_VIEW: Record<ViewKey, StateKey> = {
  'quiz-monitor': 'live',
  'quiz-present': 'live',
  'quiz-results': 'populated',
  'va-monitor': 'live',
  'va-results': 'populated',
  'audio-capture': 'prep',
  'recording-controls': 'rc-enabled-defaults',
  'quiz-editor': 'qe-gated',
  'media-grading': 'queue',
  'results-playback': 'playable',
  'quiz-student': 'sq-timed',
  'va-student': 'vs-today',
};

const WIDTHS = [340, 520, 820];

const noop = (): Promise<void> => Promise.resolve();

const HARNESS_RESULTS_ACTIONS = {
  publish: () => Promise.resolve({ responsesUpdated: 0, skipped: 0 }),
  hide: noop,
  clear: noop,
};

/** Holds monitor config so header/settings toggles (e.g. Board view) work in the harness. */
const QuizMonitorDev: React.FC<
  Omit<
    React.ComponentProps<typeof QuizLiveMonitor>,
    'config' | 'onUpdateConfig'
  >
> = (props) => {
  const [config, setConfig] = useState(makeQuizConfig);
  return (
    <QuizLiveMonitor
      {...props}
      config={config}
      onUpdateConfig={(updates) => setConfig((c) => ({ ...c, ...updates }))}
    />
  );
};

const PRESENT_STANDINGS = [
  { studentUid: 'u1', name: 'Ada Lovelace', score: 940, rank: 1 },
  { studentUid: 'u2', name: 'Grace Hopper', score: 880, rank: 2 },
  { studentUid: 'u3', name: 'Katherine Johnson', score: 720, rank: 3 },
];

const SessionView: React.FC<{
  view: ViewKey;
  state: StateKey;
  showNames: boolean;
}> = ({ view, state, showNames }) => {
  if (view === 'audio-capture') {
    const audioState = [
      ...AUDIO_CAPTURE_STATES,
      ...AUDIO_CAPTURE_DARK_STATES,
    ].includes(state as AudioCaptureStateKey)
      ? (state as AudioCaptureStateKey)
      : 'prep';
    return <AudioCaptureDevView state={audioState} />;
  }

  if (view === 'recording-controls') {
    const controlState = (
      RECORDING_CONTROL_STATES as readonly string[]
    ).includes(state)
      ? (state as RecordingControlStateKey)
      : 'rc-enabled-defaults';
    return <RecordingControlsDevView state={controlState} />;
  }

  if (view === 'quiz-editor') {
    const editorState = (QUIZ_EDITOR_STATES as readonly string[]).includes(
      state
    )
      ? (state as QuizEditorStateKey)
      : 'qe-gated';
    return <QuizEditorDevView state={editorState} />;
  }

  if (view === 'media-grading') {
    const gradingState = (MEDIA_GRADING_STATES as readonly string[]).includes(
      state
    )
      ? (state as MediaGradingStateKey)
      : 'queue';
    return <MediaGradingDevView state={gradingState} />;
  }

  if (view === 'results-playback') {
    const playbackState = (
      RESULTS_PLAYBACK_STATES as readonly string[]
    ).includes(state)
      ? (state as ResultsPlaybackStateKey)
      : 'playable';
    return <ResultsPlaybackDevView state={playbackState} />;
  }

  if (view === 'quiz-student') {
    const studentState = (STUDENT_QUIZ_STATES as readonly string[]).includes(
      state
    )
      ? (state as StudentQuizStateKey)
      : 'sq-timed';
    return <StudentQuizDevView state={studentState} />;
  }

  if (view === 'va-student') {
    const vaState = (VA_STUDENT_STATES as readonly string[]).includes(state)
      ? (state as VaStudentStateKey)
      : 'vs-today';
    return <VaStudentAnswerDevView state={vaState} />;
  }

  if (view === 'quiz-monitor') {
    const status =
      state === 'paused' ? 'paused' : state === 'ended' ? 'ended' : 'active';
    const timed = state === 'timed';
    const responses =
      state === 'waiting'
        ? []
        : timed
          ? makeTimedQuizResponses()
          : state === 'stop'
            ? makeStopQuizResponses()
            : makeQuizResponses();
    const perPeriod = state === 'per-period';
    const period = (label: string, state: 'open' | 'paused' | 'closed') => ({
      label,
      state,
      openAt: null,
      closeAt: state === 'open' ? NOW + 25 * 60_000 : null,
      bellPeriodId: null,
      verified: true,
    });
    const session = timed
      ? makeTimedQuizSession(status)
      : perPeriod
        ? {
            ...makeQuizSession(status),
            sessionMode: 'student' as const,
            periodAccess: {
              'cl-1': period('Period 1', 'paused'),
              'cl-3': period('Period 3', 'open'),
              'cl-5': period('Period 5', 'closed'),
            },
          }
        : state === 'stop'
          ? makeStopQuizSession(status)
          : state === 'multi-class'
            ? {
                ...makeQuizSession(status),
                sessionMode: 'student' as const,
                periodNames: ['Period 1', 'Period 3'],
              }
            : makeQuizSession(status);
    return (
      <QuizMonitorDev
        session={session}
        assessmentOnly={perPeriod}
        responses={responses}
        quizData={makeQuizData()}
        rosters={[]}
        onAdvance={noop}
        onEnd={noop}
        onPause={noop}
        onResume={noop}
        onRemoveStudent={noop}
        onUnlockStudent={noop}
        onSubmitForStudent={noop}
        onUnlockResultsForStudent={noop}
        onRevealAnswer={noop}
        onHideAnswer={noop}
        onBack={() => undefined}
      />
    );
  }

  if (view === 'quiz-present') {
    const status =
      state === 'waiting'
        ? 'waiting'
        : state === 'paused'
          ? 'paused'
          : state === 'ended'
            ? 'ended'
            : 'active';
    const session = {
      ...makeQuizSession(status),
      sessionMode: state === 'self-paced' ? 'student' : 'teacher',
      questionPhase: state === 'reviewing' ? 'reviewing' : 'answering',
      pauseMessage: state === 'paused' ? 'Back in 5 minutes' : undefined,
    } as ReturnType<typeof makeQuizSession>;
    const responses = state === 'waiting' ? [] : makeQuizResponses();
    return (
      <PresentScreen
        session={session}
        currentQ={makeQuizData().questions[0]}
        responses={responses}
        answered={responses.length}
        counts={{ notStarted: 2, inProgress: 3, done: 5 }}
        total={10}
        standings={PRESENT_STANDINGS}
        isGamified
        classAverage={82}
        showNames={showNames}
      />
    );
  }

  if (view === 'quiz-results' && state === 'review-game') {
    return (
      <QuizResults
        quiz={makeQuizData()}
        responses={makeReviewGameResponses()}
        config={makeQuizConfig()}
        session={makeReviewGameSession()}
        onBack={() => undefined}
        variant="review"
      />
    );
  }

  if (view === 'quiz-results') {
    const responses = state === 'empty' ? [] : makeQuizResponses();
    return (
      <QuizAttemptSourceContext.Provider
        value={(_sessionId, key) => makeQuizAttemptCopies(key)}
      >
        <QuizResults
          quiz={makeQuizData()}
          responses={responses}
          config={makeQuizConfig()}
          session={makeQuizSession('ended')}
          onBack={() => undefined}
          onSubmitStudent={noop}
          studentResultsActions={HARNESS_RESULTS_ACTIONS}
        />
      </QuizAttemptSourceContext.Provider>
    );
  }

  if (view === 'va-monitor') {
    const status =
      state === 'ended' || state === 'paused'
        ? 'ended'
        : state === 'waiting'
          ? 'waiting'
          : 'active';
    const multi = state === 'multi-class' || state === 'per-period';
    const base = multi
      ? makeVaMultiClassSession(state === 'per-period', status)
      : makeVaSession(status);
    // Public questions only, so the monitor reads the key doc (loading, then failed off-network).
    const session =
      state === 'no-answer-key'
        ? {
            ...base,
            questions: [],
            publicQuestions: vaPublicQuestions(base.questions),
          }
        : base;
    const responses =
      state === 'waiting'
        ? []
        : multi
          ? makeVaMultiClassResponses()
          : makeVaResponses();
    return (
      <VideoActivityLiveMonitor
        session={session}
        responses={responses}
        onEnd={noop}
        onPause={noop}
        onResume={noop}
        onUnlockStudent={noop}
        onBack={() => undefined}
      />
    );
  }

  // va-results
  const responses = state === 'empty' ? [] : makeVaResponses();
  return (
    <VideoActivityResults
      session={makeVaSession('ended')}
      responses={responses}
      onBack={() => undefined}
    />
  );
};

// Built once: the projection shuffles options, and a new shuffle each render refetches the key.
let vaPublicCache: VideoActivityPublicQuestion[] | null = null;
const vaPublicQuestions = (questions: VideoActivityQuestion[]) =>
  (vaPublicCache ??= questions.map((q) => toVideoActivityPublicQuestion(q)));

const urlParams = new URLSearchParams(window.location.search);
const isViewKey = (v: string | null): v is ViewKey =>
  VIEWS.some((opt) => opt.key === v);

export const SessionViewsDevHarness: React.FC = () => {
  // ?view=…&state=… opens a view; &full=1 renders it alone at page size for screenshots.
  const initialView = urlParams.get('view');
  const [view, setView] = useState<ViewKey>(
    isViewKey(initialView) ? initialView : 'quiz-monitor'
  );
  const [state, setState] = useState<StateKey>(
    (urlParams.get('state') as StateKey | null) ??
      (isViewKey(initialView) ? DEFAULT_STATE_FOR_VIEW[initialView] : 'live')
  );
  const [width, setWidth] = useState<number>(520);
  const [showNames, setShowNames] = useState(false);

  // Guard: without auth-bypass this harness would boot the real AuthProvider +
  // DashboardProvider against a live Firebase account (real Firestore
  // listeners). Bail early. (Hooks above run unconditionally — rules-of-hooks.)
  if (import.meta.env.VITE_AUTH_BYPASS !== 'true') {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Set <code className="mx-1 font-mono">VITE_AUTH_BYPASS=true</code> to use
        this harness.
      </div>
    );
  }

  if (urlParams.get('full') === '1') {
    return (
      <DialogProvider>
        <AuthProvider>
          <CustomWidgetsProvider>
            <SavedWidgetsProvider>
              <DashboardProvider>
                {/* Sized like the framed preview, so footers pin to the bottom as in the widget. */}
                <div
                  className="h-screen w-screen"
                  style={{ containerType: 'size' }}
                >
                  <SessionView
                    view={view}
                    state={state}
                    showNames={showNames}
                  />
                </div>
              </DashboardProvider>
            </SavedWidgetsProvider>
          </CustomWidgetsProvider>
        </AuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  return (
    <DialogProvider>
      <AuthProvider>
        <CustomWidgetsProvider>
          <SavedWidgetsProvider>
            <DashboardProvider>
              <div className="min-h-screen w-full bg-slate-900 p-8 flex flex-col items-start gap-6 overflow-auto">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    View
                    <select
                      value={view}
                      onChange={(e) => {
                        const next = e.target.value as ViewKey;
                        setView(next);
                        setState(DEFAULT_STATE_FOR_VIEW[next]);
                      }}
                      className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm font-normal normal-case tracking-normal text-white"
                    >
                      {VIEWS.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    State
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value as StateKey)}
                      className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm font-normal normal-case tracking-normal text-white"
                    >
                      {STATES.map((s) => (
                        <option key={s.id} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    onClick={() => setShowNames((v) => !v)}
                    aria-pressed={showNames}
                    className={`px-3 py-2 rounded text-sm font-bold transition ${
                      showNames
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {showNames ? 'Names on' : 'Names off'}
                  </button>

                  <div className="flex items-center gap-1">
                    {WIDTHS.map((w) => (
                      <button
                        key={w}
                        onClick={() => setWidth(w)}
                        className={`px-3 py-2 rounded text-sm font-bold transition ${
                          width === w
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-2xl border border-slate-700 bg-slate-100 shadow-xl overflow-hidden"
                  style={{ width, height: 640, containerType: 'size' }}
                >
                  <SessionView
                    view={view}
                    state={state}
                    showNames={showNames}
                  />
                </div>
              </div>
            </DashboardProvider>
            <DialogContainer />
          </SavedWidgetsProvider>
        </CustomWidgetsProvider>
      </AuthProvider>
    </DialogProvider>
  );
};
