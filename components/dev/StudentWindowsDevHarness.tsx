import React from 'react';
import type {
  GuidedLearningSession,
  MiniAppSession,
  VideoActivitySession,
} from '@/types';
import { StudentPeriodLockedScreen } from '@/components/student/StudentPeriodScreens';
import { periodLockState } from '@/components/student/periodLockState';
import { StudentPeriodPausedOverlay } from '@/components/student/StudentPeriodPausedOverlay';

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

const upcoming = { window: { openAt: OPENS }, state: 'upcoming' } as const;
const closed = { window: { closeAt: NOW - 1 }, state: 'closed' } as const;

const VIEWS: Record<string, React.ReactNode> = {
  'va-upcoming': (
    <StudentPeriodLockedScreen
      title={va.activityTitle}
      lock={periodLockState(va, [], NOW, null, upcoming)}
    />
  ),
  'va-closed': (
    <StudentPeriodLockedScreen
      title={va.activityTitle}
      started
      lock={periodLockState(va, [], NOW, null, closed)}
    />
  ),
  'va-closed-overlay': (
    <div className="relative h-screen bg-black">
      <StudentPeriodPausedOverlay closed />
    </div>
  ),
  'mini-upcoming': (
    <StudentPeriodLockedScreen
      title={mini.appTitle}
      lock={periodLockState(mini, [], NOW, null, upcoming)}
    />
  ),
  'mini-closed-overlay': (
    <div className="relative h-screen bg-slate-900">
      <StudentPeriodPausedOverlay closed />
    </div>
  ),
  'gl-upcoming': (
    <StudentPeriodLockedScreen
      title={gl.title}
      lock={periodLockState(gl, [], NOW, null, upcoming)}
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
