// DEV-only: Mini App's assign stepper (D20), for /assign-stepper-dev.

import React, { useState } from 'react';
import { MiniAppAssignStepper } from '@/components/widgets/MiniApp/components/MiniAppAssignStepper';
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
  const results = params.get('results');
  const [name, setName] = useState('Fraction Pizza');
  const [open, setOpen] = useState(true);

  return open ? (
    <MiniAppAssignStepper
      appTitle="Fraction Pizza"
      assignmentName={name}
      onNameChange={setName}
      rosters={ROSTERS}
      initialClassIds={['c1']}
      defaultKind={results ? 'work' : 'resource'}
      resultsDefault={
        results ? { attemptLimit: 1, showCorrectAnswers: true } : undefined
      }
      periodAccess={CTX}
      submitting={false}
      onSubmit={() => Promise.resolve()}
      onClose={() => setOpen(false)}
    />
  ) : (
    <button // no-tour-anchor: dev-only mockup page, not on the teacher board
      type="button"
      onClick={() => setOpen(true)}
    >
      Open
    </button>
  );
};

const MiniAppAssignDev = {
  title: 'Mini App assign',
  render: Preview,
};

export default MiniAppAssignDev;
