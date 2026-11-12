import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  TOUR_RECORD_EVENT,
  recordOriginOf,
  type TourOrigin,
} from '@/components/tours/tourState';

const RecordingSession = lazy(() => import('./RecordingSession'));

interface Session {
  key: number;
  origin: TourOrigin;
}

/** Runs one tour recording at a time over the board. */
export const TourRecordingHost: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const record = (e: Event) => {
      const origin = recordOriginOf(e);
      setSession((prev) => prev ?? { key: Date.now(), origin });
    };
    window.addEventListener(TOUR_RECORD_EVENT, record);
    return () => window.removeEventListener(TOUR_RECORD_EVENT, record);
  }, []);

  if (session === null) return null;
  return (
    <Suspense fallback={null}>
      <RecordingSession
        key={session.key}
        origin={session.origin}
        onEnd={() => setSession(null)}
      />
    </Suspense>
  );
};
