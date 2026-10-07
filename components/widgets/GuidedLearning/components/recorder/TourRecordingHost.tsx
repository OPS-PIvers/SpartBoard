import React, { lazy, Suspense, useEffect, useState } from 'react';
import { TOUR_RECORD_EVENT } from '@/components/tours/tourState';

const RecordingSession = lazy(() => import('./RecordingSession'));

/** Runs one tour recording at a time over the board. */
export const TourRecordingHost: React.FC = () => {
  const [session, setSession] = useState<number | null>(null);

  useEffect(() => {
    const record = () => setSession((prev) => prev ?? Date.now());
    window.addEventListener(TOUR_RECORD_EVENT, record);
    return () => window.removeEventListener(TOUR_RECORD_EVENT, record);
  }, []);

  if (session === null) return null;
  return (
    <Suspense fallback={null}>
      <RecordingSession key={session} onEnd={() => setSession(null)} />
    </Suspense>
  );
};
