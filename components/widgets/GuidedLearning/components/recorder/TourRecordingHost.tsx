import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  TOUR_RECORD_EVENT,
  recordOriginOf,
  type TourOrigin,
} from '@/components/tours/tourState';
import {
  STUDENT_TOUR_PROBE,
  STUDENT_TOUR_READY,
  STUDENT_TOUR_RECEIVED,
  STUDENT_TOUR_RECORDING,
  isMyStudentTab,
  isRecording,
} from '@/utils/studentTourHandoff';
import type { TourRecording } from './useTourCapture';

const RecordingSession = lazy(() => import('./RecordingSession'));

interface Session {
  key: number;
  origin: TourOrigin;
  /** A recording made in a View as student tab, saved here as this admin. */
  handoff?: TourRecording;
}

/** Runs one tour recording at a time over the board; student handoffs wait their turn. */
export const TourRecordingHost: React.FC<{
  /** Takes recordings from student tabs this admin opened through View as. */
  acceptStudentRecordings?: boolean;
}> = ({ acceptStudentRecordings = false }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const session = sessions[0] ?? null;

  useEffect(() => {
    const record = (e: Event) => {
      const origin = recordOriginOf(e);
      setSessions((prev) =>
        prev.length > 0 ? prev : [{ key: Date.now(), origin }]
      );
    };
    window.addEventListener(TOUR_RECORD_EVENT, record);
    return () => window.removeEventListener(TOUR_RECORD_EVENT, record);
  }, []);

  useEffect(() => {
    if (!acceptStudentRecordings) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (!isMyStudentTab(e.source)) return;
      const data = e.data as { type?: unknown; recording?: unknown } | null;
      if (data?.type === STUDENT_TOUR_PROBE) {
        e.source.postMessage(
          { type: STUDENT_TOUR_READY },
          window.location.origin
        );
      } else if (
        data?.type === STUDENT_TOUR_RECORDING &&
        isRecording(data.recording)
      ) {
        const handoff = data.recording;
        setSessions((prev) => [
          ...prev,
          { key: Date.now() + prev.length, origin: 'students', handoff },
        ]);
        e.source.postMessage(
          { type: STUDENT_TOUR_RECEIVED },
          window.location.origin
        );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [acceptStudentRecordings]);

  if (session === null) return null;
  return (
    <Suspense fallback={null}>
      <RecordingSession
        key={session.key}
        origin={session.origin}
        handoff={session.handoff}
        onEnd={() => setSessions((prev) => prev.slice(1))}
      />
    </Suspense>
  );
};
