import React, { useState } from 'react';
import {
  StudentPeriodLockedScreen,
  StudentPeriodPicker,
} from '@/components/student/StudentPeriodScreens';
import { StudentPeriodPausedOverlay } from '@/components/student/StudentPeriodPausedOverlay';
import { StudentPinJoinCard } from '@/components/student/StudentPinJoinCard';
import { StudentLobby } from '@/components/student/StudentLobby';

// DEV-ONLY: the shared student join, class and locked screens on fixtures (?screen=…&worst=1).

const OPENS = new Date('2026-11-25T10:40:00').getTime();
const PERIODS = ['Period 1', 'Period 2', 'Period 4', 'Period 6'];
const WORST_PERIODS = [
  'Period 1 · AP Biology (Hernández-Ó Súilleabháin)',
  'Period 2',
  'P3',
  'Period 4 · Science 7 Honors Accelerated Section B',
  'Period 5',
  'Period 6',
  'Period 7',
  'Period 8 · Advisory',
];

export const StudentScreensDevHarness: React.FC = () => {
  const q = new URLSearchParams(window.location.search);
  const worst = q.get('worst') === '1';
  const title = worst
    ? 'Unit 4 Cell Structure and Function Check-in: Organelles, Membranes and Transport'
    : 'Cell Structure Check-in';
  const [pin, setPin] = useState(worst ? '0123456789' : '');
  const [code, setCode] = useState(worst ? 'ABCD1234' : '');
  switch (q.get('screen')) {
    case 'paused':
      return (
        <StudentPeriodLockedScreen
          title={title}
          lock={{ opensAt: null, paused: true }}
          started
        />
      );
    case 'closed':
      return (
        <StudentPeriodLockedScreen
          title={title}
          lock={{ opensAt: null, paused: false }}
          pin={worst ? '0123456789' : '12'}
        />
      );
    case 'overlay':
      return (
        <div className="relative h-screen bg-slate-200">
          <StudentPeriodPausedOverlay />
        </div>
      );
    case 'quiz-join':
      return (
        <StudentPinJoinCard
          title="Join Quiz"
          intro="Enter the code and your PIN from your teacher."
          code={{
            value: code,
            onChange: (v) => setCode(v.toUpperCase()),
            placeholder: 'Quiz Code (XXXXXX)',
            maxLength: 8,
          }}
          pin={pin}
          onPinChange={setPin}
          onSubmit={() => undefined}
          busy={false}
          error={
            worst
              ? 'That PIN is not on the class list. Check it with your teacher.'
              : null
          }
        />
      );
    case 'va-join':
      return (
        <StudentPinJoinCard
          title="Join Activity"
          intro="Enter your PIN from your teacher."
          pin={pin}
          onPinChange={setPin}
          onSubmit={() => undefined}
          busy={false}
        />
      );
    case 'va-preview':
      return (
        <StudentPinJoinCard
          preview
          title="Join Activity"
          intro="Enter your PIN from your teacher."
          pin=""
          onPinChange={() => undefined}
          onSubmit={() => undefined}
          busy={false}
        />
      );
    case 'live-join':
      return <StudentLobby onJoin={() => undefined} isLoading={false} />;
    case 'period':
      return (
        <StudentPeriodPicker
          title={title}
          periods={worst ? WORST_PERIODS : PERIODS}
          pendingPeriod={q.get('pending') === '1' ? 'Period 2' : null}
          onPick={() => undefined}
          onBack={() => undefined}
        />
      );
    default:
      return (
        <StudentPeriodLockedScreen
          title={title}
          lock={{ opensAt: OPENS, paused: false }}
        />
      );
  }
};
