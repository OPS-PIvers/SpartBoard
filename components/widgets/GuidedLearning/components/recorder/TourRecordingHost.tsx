import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  rerecordTargetOf,
  TOUR_OPEN_STUDIO_EVENT,
  TOUR_RECORD_EVENT,
  type StudioReturn,
} from '@/components/tours/tourState';
import type { StepRecapture } from './recordingHandoff';

const RecordingSession = lazy(() => import('./RecordingSession'));
const RerecordSession = lazy(() => import('./RerecordSession'));
const StudioReopen = lazy(() => import('./StudioReopen'));

type HostState =
  | { kind: 'record'; key: number }
  | { kind: 'rerecord'; key: number; target: StudioReturn }
  | {
      kind: 'studio';
      key: number;
      target: StudioReturn;
      recapture?: StepRecapture;
    };

/** Runs one tour recording, one-step re-recording or returning Studio at a time over the board. */
export const TourRecordingHost: React.FC = () => {
  const [state, setState] = useState<HostState | null>(null);

  useEffect(() => {
    const record = (e: Event) => {
      const target = rerecordTargetOf(e);
      setState(
        (prev) =>
          prev ??
          (target
            ? { kind: 'rerecord', key: Date.now(), target }
            : { kind: 'record', key: Date.now() })
      );
    };
    const open = (e: Event) => {
      const target = rerecordTargetOf(e);
      if (!target) return;
      setState((prev) => prev ?? { kind: 'studio', key: Date.now(), target });
    };
    window.addEventListener(TOUR_RECORD_EVENT, record);
    window.addEventListener(TOUR_OPEN_STUDIO_EVENT, open);
    return () => {
      window.removeEventListener(TOUR_RECORD_EVENT, record);
      window.removeEventListener(TOUR_OPEN_STUDIO_EVENT, open);
    };
  }, []);

  if (!state) return null;
  const end = () => setState(null);
  return (
    <Suspense fallback={null}>
      {state.kind === 'record' && (
        <RecordingSession key={state.key} onEnd={end} />
      )}
      {state.kind === 'rerecord' && (
        <RerecordSession
          key={state.key}
          target={state.target}
          onDone={(recapture) =>
            setState({
              kind: 'studio',
              key: Date.now(),
              target: state.target,
              ...(recapture ? { recapture } : {}),
            })
          }
        />
      )}
      {state.kind === 'studio' && (
        <StudioReopen
          key={state.key}
          target={state.target}
          recapture={state.recapture}
          onEnd={end}
        />
      )}
    </Suspense>
  );
};
