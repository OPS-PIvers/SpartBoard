import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  rerecordTargetOf,
  TOUR_OPEN_STUDIO_EVENT,
  TOUR_RECORD_EVENT,
  TOUR_SNAPSHOTS_EVENT,
  type StudioReturn,
  type TourSnapshots,
} from '@/components/tours/tourState';
import type { StepRecapture } from './recordingHandoff';

const RecordingSession = lazy(() => import('./RecordingSession'));
const RerecordSession = lazy(() => import('./RerecordSession'));
const StudioReopen = lazy(() => import('./StudioReopen'));
const SnapshotSession = lazy(() => import('./SnapshotSession'));

type HostState =
  | { kind: 'record'; key: number }
  | { kind: 'rerecord'; key: number; target: StudioReturn }
  | { kind: 'snapshots'; key: number; snapshots: TourSnapshots }
  | {
      kind: 'studio';
      key: number;
      target: StudioReturn;
      recaptures?: StepRecapture[];
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
    const review = (e: Event) => {
      const snapshots = (e as CustomEvent<TourSnapshots>).detail;
      if (!snapshots?.shots?.length) return;
      setState(
        (prev) => prev ?? { kind: 'snapshots', key: Date.now(), snapshots }
      );
    };
    window.addEventListener(TOUR_RECORD_EVENT, record);
    window.addEventListener(TOUR_OPEN_STUDIO_EVENT, open);
    window.addEventListener(TOUR_SNAPSHOTS_EVENT, review);
    return () => {
      window.removeEventListener(TOUR_RECORD_EVENT, record);
      window.removeEventListener(TOUR_OPEN_STUDIO_EVENT, open);
      window.removeEventListener(TOUR_SNAPSHOTS_EVENT, review);
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
              ...(recapture ? { recaptures: [recapture] } : {}),
            })
          }
        />
      )}
      {state.kind === 'snapshots' && (
        <SnapshotSession
          key={state.key}
          snapshots={state.snapshots}
          onDone={(recaptures) =>
            setState({
              kind: 'studio',
              key: Date.now(),
              target: {
                setId: state.snapshots.setId,
                stepId: state.snapshots.stepId,
              },
              recaptures,
            })
          }
        />
      )}
      {state.kind === 'studio' && (
        <StudioReopen
          key={state.key}
          target={state.target}
          recaptures={state.recaptures}
          onEnd={end}
        />
      )}
    </Suspense>
  );
};
