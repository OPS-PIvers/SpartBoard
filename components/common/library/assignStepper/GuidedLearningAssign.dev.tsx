// DEV-only: Guided Learning's assign stepper, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import { GuidedLearningAssignStepper } from '@/components/widgets/GuidedLearning/components/GuidedLearningAssignStepper';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const ROSTERS = SAMPLE_ROSTERS.map((r, i) => ({
  ...r,
  bellPeriod: { buildingId: 'b', periodId: String(i + 1) },
}));

const CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: () => null,
  onTagRoster: () => undefined,
};

const Preview: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [open, setOpen] = useState(true);
  return open ? (
    <GuidedLearningAssignStepper
      title="Parts of a Cell"
      rosters={ROSTERS}
      initialRosterIds={ROSTERS.map((r) => r.id)}
      canCollectWork={params.get('locked') !== '1'}
      defaultKind="resource"
      periodAccess={CTX}
      onClose={() => setOpen(false)}
      onAssign={() => setOpen(false)}
    />
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white"
    >
      Assign
    </button>
  );
};

export default {
  title: 'Guided Learning assign',
  render: () => <Preview />,
};
