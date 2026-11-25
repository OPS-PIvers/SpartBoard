import React from 'react';
import type {
  GuidedLearningSession,
  MiniAppSession,
  VideoActivitySession,
} from '@/types';
import {
  VideoActivityPeriodLockedScreen,
  VideoActivityPeriodPausedOverlay,
} from '@/components/videoActivity/VideoActivityPeriodLockedScreen';
import {
  MiniAppPeriodLockedScreen,
  MiniAppPeriodPausedOverlay,
} from '@/components/miniApp/MiniAppPeriodLockedScreen';
import { GuidedLearningPeriodLockedScreen } from '@/components/guidedLearning/GuidedLearningPeriodLockedScreen';

const NOW = Date.now();
const OPENS = NOW + 26 * 3_600_000;

const va = {
  id: 'va',
  activityTitle: 'Photosynthesis in action',
} as VideoActivitySession;
const mini = {
  id: 'mini',
  appTitle: 'Fraction pizza builder',
} as MiniAppSession;
const gl = { id: 'gl', title: 'Parts of a cell' } as GuidedLearningSession;

const VIEWS: Record<string, React.ReactNode> = {
  'va-upcoming': (
    <VideoActivityPeriodLockedScreen
      session={va}
      periodKeys={[]}
      now={NOW}
      started={false}
      ownWindow={{ window: { openAt: OPENS }, state: 'upcoming' }}
    />
  ),
  'va-closed': (
    <VideoActivityPeriodLockedScreen
      session={va}
      periodKeys={[]}
      now={NOW}
      started
      ownWindow={{ window: { closeAt: NOW - 1 }, state: 'closed' }}
    />
  ),
  'va-closed-overlay': (
    <div className="relative h-screen bg-black">
      <VideoActivityPeriodPausedOverlay closed />
    </div>
  ),
  'mini-upcoming': (
    <MiniAppPeriodLockedScreen
      session={mini}
      periodKeys={[]}
      now={NOW}
      opensAt={OPENS}
    />
  ),
  'mini-closed-overlay': (
    <div className="relative h-screen bg-slate-900">
      <MiniAppPeriodPausedOverlay closed />
    </div>
  ),
  'gl-upcoming': (
    <GuidedLearningPeriodLockedScreen
      session={gl}
      periodKeys={[]}
      now={NOW}
      opensAt={OPENS}
      ownOpen
    />
  ),
};

/** Dev-only: the student screens a student's own Opens and Closes show (`?view=`). */
export const StudentWindowsDevHarness: React.FC = () => {
  const view = new URLSearchParams(window.location.search).get('view') ?? '';
  return (
    VIEWS[view] ?? (
      <ul className="p-6 space-y-2">
        {Object.keys(VIEWS).map((key) => (
          <li key={key}>
            <a className="text-blue-700 underline" href={`?view=${key}`}>
              {key}
            </a>
          </li>
        ))}
      </ul>
    )
  );
};
