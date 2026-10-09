// Guided Learning's assign dialog on the stepper (docs/plans/ASSIGN_STEPPER.md D2, D4).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassRoster } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import { AssignTopSwitch } from '@/components/common/library/assignStepper/AssignTopSwitch';
import { KIND_SWITCH_OPTIONS } from '@/components/common/library/assignStepper/assignTopSwitchOptions';
import {
  getAssignSteps,
  getAssignStepTitle,
  type AssignKind,
  type AssignStepDef,
} from '@/components/common/library/assignStepper/assignSteps';
import { ClassPickerMenu } from '@/components/common/library/assignStepper/ClassPickerMenu';
import { StudentPickMenu } from '@/components/common/library/assignStepper/StudentPickMenu';
import {
  formatClassesValue,
  type AssignClassesValue,
} from '@/components/common/library/assignStepper/assignClassesValue';
import {
  ModificationsLink,
  ModificationsView,
} from '@/components/common/library/assignStepper/ModificationsView';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import { applyWhen, manualStartAvailable } from '@/utils/assignAvailability';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import { tourAttr } from '@/config/tourAnchors';

export interface GuidedLearningStepperAssign {
  classes: AssignClassesValue;
  targeting: AssignTargetingValue;
  /** Manual: every picked class gets a closed gate the teacher starts. */
  manualStart: boolean;
}

export const GuidedLearningAssignStepper: React.FC<{
  title: string;
  rosters: ClassRoster[];
  /** Remembered classes for this set. */
  initialRosterIds: string[];
  /** The admin's Guided Learning mode allows submissions, so the kind is the teacher's choice. */
  canCollectWork: boolean;
  defaultKind: AssignKind;
  periodAccess?: AssignPeriodAccessContext;
  onClose: () => void;
  onAssign: (assign: GuidedLearningStepperAssign) => void | Promise<void>;
}> = ({
  title,
  rosters,
  initialRosterIds,
  canCollectWork,
  defaultKind,
  periodAccess,
  onClose,
  onAssign,
}) => {
  const { t } = useTranslation();
  const visibleRosters = rosters.filter((r) => !r.loadError);
  const [kind, setKind] = useState<AssignKind>(
    canCollectWork ? defaultKind : 'resource'
  );
  const [classes, setClasses] = useState<AssignClassesValue>(() => ({
    classIds: initialRosterIds.filter((id) =>
      visibleRosters.some((r) => r.id === id)
    ),
    studentsByClass: {},
  }));
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const bellWindow = periodAccess?.bellWindow;
  const manualAvailable = manualStartAvailable(bellWindow);
  const [when, setWhen] = useState<AssignWhenValue>(() =>
    defaultWhenValue({
      activity: 'gl',
      bellAvailable: !!bellWindow,
      manualAvailable,
    })
  );
  const [modificationsOpen, setModificationsOpen] = useState(false);

  const picked = visibleRosters.filter((r) => classes.classIds.includes(r.id));
  const ctx = { kind };
  const whenVariant = kind === 'resource' ? 'available' : 'when';

  const handleAssign = async () => {
    const { targeting: resolved } = applyWhen(targeting, {
      mode: when.mode,
      rosters: picked,
      bellWindow,
      workKind: { default: kind, locked: true },
    });
    await onAssign({
      classes,
      targeting: resolved,
      manualStart: kind === 'work' && when.mode === 'manual' && manualAvailable,
    });
  };

  const steps: AssignStepDef[] = getAssignSteps('gl', ctx).map((id) => {
    const stepTitle = getAssignStepTitle(id, 'gl', ctx);
    if (id === 'classes') {
      return {
        id,
        title: stepTitle,
        value: formatClassesValue(classes, visibleRosters),
        body: (
          <div className="space-y-3">
            <ClassPickerMenu
              rosters={visibleRosters}
              value={classes}
              onChange={setClasses}
            />
            <StudentPickMenu
              rosters={visibleRosters}
              value={classes}
              onChange={setClasses}
            />
            {picked.length > 0 && (
              <ModificationsLink
                rosters={visibleRosters}
                selectedRosterIds={classes.classIds}
                value={targeting}
                onOpen={() => setModificationsOpen(true)}
              />
            )}
          </div>
        ),
      };
    }
    return {
      id,
      title: stepTitle,
      value: formatWhenValue(when, {
        variant: whenVariant,
        rosterCount: picked.length,
        manualAvailable,
        t,
      }),
      body: (
        <AssignWhenStep
          value={when}
          onChange={setWhen}
          variant={whenVariant}
          rosters={picked}
          periodAccess={periodAccess}
        />
      ),
    };
  });

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={title}
      topSwitch={
        canCollectWork ? (
          <AssignTopSwitch
            value={kind}
            onChange={setKind}
            options={KIND_SWITCH_OPTIONS}
            ariaLabel="Student work"
            anchor={tourAttr('gl-assign.kind-switch')}
          />
        ) : undefined
      }
      steps={steps}
      submitLabel="Assign"
      onSubmit={handleAssign}
      overlayView={
        modificationsOpen ? (
          <ModificationsView
            activityTitle={title}
            rosters={visibleRosters}
            selectedRosterIds={classes.classIds}
            value={targeting}
            onChange={setTargeting}
            onBack={() => setModificationsOpen(false)}
            quizMode={false}
          />
        ) : undefined
      }
    />
  );
};
