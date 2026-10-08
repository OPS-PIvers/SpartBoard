// DEV-only: Mini App's assign dialog, today's (?before=1) and on the stepper (D20), for /assign-stepper-dev.

import React, { useState } from 'react';
import { MiniAppAssignStepper } from '@/components/widgets/MiniApp/components/MiniAppAssignStepper';
import { MiniAppAssignModal } from '@/components/widgets/MiniApp/Widget';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
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
  const before = new URLSearchParams(window.location.search).get('before');
  const [name, setName] = useState('Fraction Pizza');
  const [picker, setPicker] = useState({ rosterIds: ['c1'] });
  const [targeting, setTargeting] = useState(EMPTY_ASSIGN_TARGETING_VALUE);
  const [open, setOpen] = useState(true);

  if (before)
    return (
      <div
        className="relative h-[640px] w-[420px] overflow-hidden rounded-2xl bg-slate-800"
        style={{ containerType: 'size' }}
      >
        <MiniAppAssignModal
          appTitle="Fraction Pizza"
          assignmentName={name}
          onNameChange={setName}
          isCreating={false}
          createdSessionId={null}
          error={null}
          rosters={ROSTERS}
          pickerValue={picker}
          onPickerChange={setPicker}
          mode="submissions"
          targetingValue={targeting}
          onTargetingChange={setTargeting}
          skippedStudentNames={[]}
          periodAccess={CTX}
          availabilityEnabled
          workKind={{ default: 'resource' }}
          onConfirm={() => undefined}
          onClose={() => undefined}
        />
      </div>
    );

  return open ? (
    <MiniAppAssignStepper
      appTitle="Fraction Pizza"
      assignmentName={name}
      onNameChange={setName}
      rosters={ROSTERS}
      initialClassIds={['c1']}
      defaultKind="resource"
      periodAccess={CTX}
      submitting={false}
      onSubmit={() => Promise.resolve()}
      onClose={() => setOpen(false)}
    />
  ) : (
    <button type="button" onClick={() => setOpen(true)}>
      Open
    </button>
  );
};

const MiniAppAssignDev = {
  title: 'Mini App assign',
  render: Preview,
};

export default MiniAppAssignDev;
