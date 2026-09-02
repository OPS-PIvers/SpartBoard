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
import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import { SavedWidgetsProvider } from '@/context/SavedWidgetsContext';
import { DashboardProvider } from '@/context/DashboardContext';
import { QuizLiveMonitor } from '@/components/widgets/QuizWidget/components/QuizLiveMonitor';
import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';
import { VideoActivityLiveMonitor } from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor';
import { Results as VideoActivityResults } from '@/components/widgets/VideoActivityWidget/components/Results';
import { PresentScreen } from '@/components/widgets/QuizWidget/components/present/PresentScreen';
import {
  AudioCaptureDevView,
  AUDIO_CAPTURE_STATES,
  AUDIO_CAPTURE_DARK_STATES,
  type AudioCaptureStateKey,
} from './AudioCaptureDevView';
import {
  RecordingControlsDevView,
  RECORDING_CONTROL_STATES,
  type RecordingControlStateKey,
} from './RecordingControlsDevView';
import {
  MediaGradingDevView,
  MEDIA_GRADING_STATES,
  type MediaGradingStateKey,
} from './MediaGradingDevView';
import {
  ResultsPlaybackDevView,
  RESULTS_PLAYBACK_STATES,
  type ResultsPlaybackStateKey,
} from './ResultsPlaybackDevView';
import {
  makeQuizSession,
  makeQuizResponses,
  makeQuizData,
  makeQuizConfig,
  makeVaSession,
  makeVaResponses,
} from './sessionViewsMocks';

type ViewKey =
  | 'quiz-monitor'
  | 'quiz-present'
  | 'quiz-results'
  | 'va-monitor'
  | 'va-results'
  | 'audio-capture'
  | 'recording-controls'
  | 'media-grading'
  | 'results-playback';
type StateKey =
  | 'waiting'
  | 'live'
  | 'reviewing'
  | 'self-paced'
  | 'paused'
  | 'ended'
  | 'populated'
  | 'empty'
  | AudioCaptureStateKey
  | RecordingControlStateKey
  | MediaGradingStateKey
  | ResultsPlaybackStateKey;

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'quiz-monitor', label: 'Quiz Monitor' },
  { key: 'quiz-present', label: 'Quiz Present' },
  { key: 'quiz-results', label: 'Quiz Results' },
  { key: 'va-monitor', label: 'VA Monitor' },
  { key: 'va-results', label: 'VA Results' },
  { key: 'audio-capture', label: 'Audio capture' },
  { key: 'recording-controls', label: 'Recording controls' },
  { key: 'media-grading', label: 'Media grading' },
  { key: 'results-playback', label: 'Results playback' },
];

// State keys are partitioned by view family: monitors use the lifecycle
// states (waiting/live/paused/ended), results use populated/empty. Offering
// an irrelevant state for a view (e.g. "paused" on a results view) is a
// harmless no-op — the mapper coerces to a sensible session status.
const STATES: { key: StateKey; label: string }[] = [
  { key: 'waiting', label: 'Waiting (no responses)' },
  { key: 'live', label: 'Live' },
  { key: 'reviewing', label: 'Reviewing (present)' },
  { key: 'self-paced', label: 'Self-paced (present)' },
  { key: 'paused', label: 'Paused' },
  { key: 'ended', label: 'Ended' },
  { key: 'populated', label: 'Populated (results)' },
  { key: 'empty', label: 'Empty (results)' },
  ...AUDIO_CAPTURE_STATES.map((key) => ({
    key: key as StateKey,
    label: `Audio: ${key}`,
  })),
  ...AUDIO_CAPTURE_DARK_STATES.map((key) => ({
    key: key as StateKey,
    label: `Audio (dark): ${key.slice('dark-'.length)}`,
  })),
  ...RECORDING_CONTROL_STATES.map((key) => ({
    key: key as StateKey,
    label: `Recording: ${key.slice('rc-'.length)}`,
  })),
  ...MEDIA_GRADING_STATES.map((key) => ({
    key: key as StateKey,
    label: `Grading: ${key}`,
  })),
  ...RESULTS_PLAYBACK_STATES.map((key) => ({
    key: key as StateKey,
    label: `Playback: ${key}`,
  })),
];

// Picking a view moves the State select onto a key that view actually reads.
const DEFAULT_STATE_FOR_VIEW: Record<ViewKey, StateKey> = {
  'quiz-monitor': 'live',
  'quiz-present': 'live',
  'quiz-results': 'populated',
  'va-monitor': 'live',
  'va-results': 'populated',
  'audio-capture': 'prep',
  'recording-controls': 'rc-enabled-defaults',
  'media-grading': 'queue',
  'results-playback': 'playable',
};

const WIDTHS = [340, 520, 820];

const noop = (): Promise<void> => Promise.resolve();

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

  if (view === 'quiz-monitor') {
    const status =
      state === 'paused' ? 'paused' : state === 'ended' ? 'ended' : 'active';
    const responses = state === 'waiting' ? [] : makeQuizResponses();
    return (
      <QuizLiveMonitor
        session={makeQuizSession(status)}
        responses={responses}
        quizData={makeQuizData()}
        config={makeQuizConfig()}
        rosters={[]}
        onAdvance={noop}
        onEnd={noop}
        onPause={noop}
        onResume={noop}
        onUpdateConfig={() => undefined}
        onRemoveStudent={noop}
        onUnlockStudent={noop}
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

  if (view === 'quiz-results') {
    const responses = state === 'empty' ? [] : makeQuizResponses();
    return (
      <QuizResults
        quiz={makeQuizData()}
        responses={responses}
        config={makeQuizConfig()}
        session={makeQuizSession('ended')}
        onBack={() => undefined}
      />
    );
  }

  if (view === 'va-monitor') {
    const status = state === 'ended' ? 'ended' : 'active';
    const responses = state === 'waiting' ? [] : makeVaResponses();
    return (
      <VideoActivityLiveMonitor
        session={makeVaSession(status)}
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

export const SessionViewsDevHarness: React.FC = () => {
  const [view, setView] = useState<ViewKey>('quiz-monitor');
  const [state, setState] = useState<StateKey>('live');
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
                        <option key={s.key} value={s.key}>
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
          </SavedWidgetsProvider>
        </CustomWidgetsProvider>
      </AuthProvider>
    </DialogProvider>
  );
};
