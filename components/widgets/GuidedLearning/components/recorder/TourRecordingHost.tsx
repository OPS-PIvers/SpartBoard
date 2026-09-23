import React, { lazy, Suspense, useEffect, useState } from 'react';
import { TOUR_RECORD_EVENT } from '@/components/tours/tourState';

const RecordingSession = lazy(() => import('./RecordingSession'));

/** Waits for "Record a tour" and runs one recording session at a time over the board. */
export const TourRecordingHost: React.FC = () => {
  const [session, setSession] = useState(0);

  useEffect(() => {
    const start = () => setSession((n) => (n > 0 ? n : Date.now()));
    window.addEventListener(TOUR_RECORD_EVENT, start);
    return () => window.removeEventListener(TOUR_RECORD_EVENT, start);
  }, []);

  if (!session) return null;
  return (
    <Suspense fallback={null}>
      <RecordingSession key={session} onEnd={() => setSession(0)} />
    </Suspense>
  );
};
