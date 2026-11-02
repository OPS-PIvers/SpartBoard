// DEV-only: Video Activity on the assign stepper, for /assign-stepper-dev?view=VideoAssignStepper (`&flag=off` hides the rule steps).
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { Plc } from '@/types';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { VideoAssignStepper } from './VideoAssignStepper';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';
import { videoRulesFromBehavior } from './VideoRuleStepValues';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';

const PLCS = [
  { id: 'plc-a', name: 'Grade 8 Science PLC' },
  { id: 'plc-b', name: 'Orono MS Science' },
] as Plc[];

const PERIODS: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: (_roster, date) => {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    return { openAt: start.getTime(), closeAt: start.getTime() + 50 * 60e3 };
  },
  onTagRoster: () => undefined,
};

const Preview: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [open, setOpen] = useState(true);
  if (!open)
    return (
      <button // no-tour-anchor: dev-only mockup page, not on the teacher board
        type="button"
        onClick={() => setOpen(true)}
        className="m-6 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white"
      >
        Open
      </button>
    );
  return (
    <VideoAssignStepper
      onClose={() => setOpen(false)}
      title="Cell Division Video"
      rosters={SAMPLE_ROSTERS}
      periodAccess={params.get('bells') === '0' ? undefined : PERIODS}
      plcs={params.get('plc') === '0' ? [] : PLCS}
      canAssignLive={params.get('live') !== '0'}
      lastPacing={params.get('pacing') === 'teacher' ? 'teacher' : null}
      initialClassIds={SAMPLE_ROSTERS.map((r) => r.id)}
      initialRules={
        params.get('flag') === 'off'
          ? undefined
          : videoRulesFromBehavior(DEFAULT_VA_BEHAVIOR)
      }
      onSubmit={() => Promise.resolve()}
    />
  );
};

export default { title: 'Video Activity', render: Preview };
