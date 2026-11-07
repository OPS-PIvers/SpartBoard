import { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useGettingStartedProgress } from '@/hooks/useGettingStarted';
import { isQuietStart, QUIET_START_MS } from '@/utils/gettingStartedProgress';

export interface FirstRunState {
  /** The Sparty welcome is waiting for this teacher (D1, D5). */
  welcomePending: boolean;
  /** What's New, first-use tour offers and Drive alerts are held (D7). */
  quiet: boolean;
  /** The app made this account's first board under Getting Started (D3). */
  firstRun: boolean;
}

/** A brand-new teacher's welcome and quiet start; everything is off without the Getting Started flag. */
export function useFirstRun(): FirstRunState {
  const { user, canAccessFeature } = useAuth();
  const on = canAccessFeature('getting-started');
  const { progress, loading } = useGettingStartedProgress(
    on ? user?.uid : undefined
  );
  // Read once per mount; a week-long window needs no live clock.
  const [now] = useState(Date.now);
  return {
    // A welcome left pending past the first week never appears, so a teacher who joined before the flag opened isn't interrupted (D4).
    welcomePending:
      on &&
      !loading &&
      progress.welcome === 'pending' &&
      progress.firstSignInAt !== undefined &&
      now - progress.firstSignInAt < QUIET_START_MS,
    // Held while the doc loads, so a new teacher's Drive alert never flashes before it.
    quiet: on && (loading || isQuietStart(progress, now)),
    firstRun: on && progress.firstSignInAt !== undefined,
  };
}
