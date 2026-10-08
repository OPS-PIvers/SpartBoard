// DEV-only: Guided Learning's assign dialog, stepper and legacy (?legacy=1), for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import { GuidedLearningAssignStepper } from '@/components/widgets/GuidedLearning/components/GuidedLearningAssignStepper';
import { AssignModal } from '../AssignModal';
import { AssignTargetingSection } from '../AssignTargetingSection';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import type { AssignClassPickerValue } from '@/components/common/AssignClassPicker.helpers';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
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

const Legacy: React.FC = () => {
  const [picker, setPicker] = useState<AssignClassPickerValue>({
    rosterIds: ROSTERS.map((r) => r.id),
  });
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  return (
    <AssignModal<AssignClassPickerValue>
      isOpen
      onClose={() => undefined}
      itemTitle="Parts of a Cell"
      options={picker}
      onOptionsChange={setPicker}
      extraSlot={
        <div className="space-y-3">
          <AssignClassPicker
            rosters={ROSTERS}
            value={picker}
            onChange={setPicker}
          />
          <AssignTargetingSection
            rosters={ROSTERS}
            selectedRosterIds={picker.rosterIds}
            periodAccess={CTX}
            value={targeting}
            onChange={setTargeting}
            kind="guided-learning"
            showDueAt
            availabilityEnabled
            workKind={{ default: 'resource' }}
          />
        </div>
      }
      onAssign={() => undefined}
      confirmLabel="Assign"
    />
  );
};

const Preview: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [open, setOpen] = useState(true);
  if (params.get('legacy') === '1') return <Legacy />;
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
