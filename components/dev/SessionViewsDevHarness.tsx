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
import {
  makeQuizSession,
  makeQuizResponses,
  makeQuizData,
  makeQuizConfig,
  makeVaSession,
  makeVaResponses,
} from './sessionViewsMocks';

type ViewKey = 'quiz-monitor' | 'quiz-results' | 'va-monitor' | 'va-results';
type StateKey = 'waiting' | 'live' | 'paused' | 'ended' | 'populated' | 'empty';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'quiz-monitor', label: 'Quiz Monitor' },
  { key: 'quiz-results', label: 'Quiz Results' },
  { key: 'va-monitor', label: 'VA Monitor' },
  { key: 'va-results', label: 'VA Results' },
];

// State keys are partitioned by view family: monitors use the lifecycle
// states (waiting/live/paused/ended), results use populated/empty. Offering
// an irrelevant state for a view (e.g. "paused" on a results view) is a
// harmless no-op — the mapper coerces to a sensible session status.
const STATES: { key: StateKey; label: string }[] = [
  { key: 'waiting', label: 'Waiting (no responses)' },
  { key: 'live', label: 'Live' },
  { key: 'paused', label: 'Paused' },
  { key: 'ended', label: 'Ended' },
  { key: 'populated', label: 'Populated (results)' },
  { key: 'empty', label: 'Empty (results)' },
];

const WIDTHS = [340, 520, 820];

const noop = (): Promise<void> => Promise.resolve();

const SessionView: React.FC<{ view: ViewKey; state: StateKey }> = ({
  view,
  state,
}) => {
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
                      onChange={(e) => setView(e.target.value as ViewKey)}
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
                  <SessionView view={view} state={state} />
                </div>
              </div>
            </DashboardProvider>
          </SavedWidgetsProvider>
        </CustomWidgetsProvider>
      </AuthProvider>
    </DialogProvider>
  );
};
