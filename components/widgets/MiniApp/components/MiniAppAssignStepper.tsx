// Mini App's assign dialog on the stepper: name, Students submit work / Study resource, Classes, When (docs/plans/shipped/ASSIGN_STEPPER.md D20).
import React, { useState } from 'react';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { useTranslation } from 'react-i18next';
import type { ClassRoster } from '@/types';
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
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  useAssignAudience,
  withAudienceSwitch,
} from '@/components/common/library/assignStepper/assignAudience';
import {
  defaultWhenValue,
  formatWhenValue,
  whenBackwards,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import {
  ModificationsLink,
  ModificationsView,
} from '@/components/common/library/assignStepper/ModificationsView';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type { MiniAppStepperChoices } from '../miniAppStepperAssign';
import { MiniAppResultsStep } from './MiniAppResultsStep';
import {
  formatMiniAppResultsChoice,
  type MiniAppResultsChoice,
} from '@/utils/miniAppResults';

export interface MiniAppAssignStepperProps {
  appTitle: string;
  assignmentName: string;
  onNameChange: (name: string) => void;
  rosters: ClassRoster[];
  /** The teacher's last classes for this app. */
  initialClassIds: string[];
  /** Study resource unless the teacher picks otherwise. */
  defaultKind: AssignKind;
  periodAccess?: AssignPeriodAccessContext;
  submitting: boolean;
  onSubmit: (
    choices: MiniAppStepperChoices,
    results?: MiniAppResultsChoice
  ) => Promise<void>;
  onClose: () => void;
  /** Mini App results on: adds the Attempts and results step for submitted work. */
  resultsDefault?: MiniAppResultsChoice;
}

export const MiniAppAssignStepper: React.FC<MiniAppAssignStepperProps> = ({
  appTitle,
  assignmentName,
  onNameChange,
  rosters,
  initialClassIds,
  defaultKind,
  periodAccess,
  submitting,
  onSubmit,
  onClose,
  resultsDefault,
}) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AssignKind>(defaultKind);
  const [classes, setClasses] = useState<AssignClassesValue>(() => ({
    classIds: initialClassIds.filter((id) => rosters.some((r) => r.id === id)),
    studentsByClass: {},
  }));
  const manualAvailable = !!periodAccess;
  const [when, setWhen] = useState<AssignWhenValue>(() =>
    defaultWhenValue({
      activity: 'miniapp',
      bellAvailable: !!periodAccess,
      manualAvailable,
    })
  );
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [showMods, setShowMods] = useState(false);
  const [results, setResults] = useState<MiniAppResultsChoice | undefined>(
    resultsDefault
  );
  const resultsStepOn = !!results && kind === 'work';
  const audienceState = useAssignAudience();
  const staff = audienceState.audience === 'staff';

  const pickedRosters = staff
    ? []
    : rosters.filter((r) => classes.classIds.includes(r.id));
  const variant = kind === 'resource' ? 'available' : 'when';
  const ctx = { kind };
  const nameMissing = assignmentName.trim().length === 0;
  const backwards = whenBackwards(
    when,
    pickedRosters,
    periodAccess?.bellWindow,
    kind
  );

  const bodies = {
    classes: (
      <div className="space-y-3">
        <ClassPickerMenu
          rosters={rosters}
          value={classes}
          onChange={setClasses}
          anchor={tourTypeAttr('mini-app.stepper-class-picker', 'miniApp')}
          rowAnchor={(classId) =>
            tourFieldAttr('mini-app.stepper-class-row', 'miniApp', classId)
          }
        />
        <StudentPickMenu
          rosters={rosters}
          value={classes}
          onChange={setClasses}
          rowAnchor={(classId) =>
            tourFieldAttr('mini-app.stepper-student-menu', 'miniApp', classId)
          }
        />
        <ModificationsLink
          rosters={rosters}
          selectedRosterIds={classes.classIds}
          value={targeting}
          onOpen={() => setShowMods(true)}
        />
      </div>
    ),
    when: (
      <AssignWhenStep
        value={when}
        onChange={setWhen}
        variant={variant}
        rosters={pickedRosters}
        periodAccess={periodAccess}
      />
    ),
  };
  const values = {
    classes: formatClassesValue(classes, rosters),
    when: formatWhenValue(when, {
      variant,
      rosterCount: pickedRosters.length,
      manualAvailable,
      t,
    }),
  };
  const steps: AssignStepDef[] = getAssignSteps('miniapp', ctx)
    .filter((id): id is 'classes' | 'when' => id === 'classes' || id === 'when')
    .map((id) => {
      const step: AssignStepDef = {
        id,
        title: getAssignStepTitle(id, 'miniapp', ctx),
        value: values[id],
        body: bodies[id],
      };
      return id === 'classes' ? withAudienceSwitch(step, audienceState) : step;
    });
  if (resultsStepOn && results)
    steps.push({
      id: 'attempts',
      title: 'Attempts and results',
      value: formatMiniAppResultsChoice(results),
      body: <MiniAppResultsStep value={results} onChange={setResults} />,
    });

  const topSwitch = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="miniapp-assignment-name"
          className="block text-sm font-bold text-brand-blue-dark"
        >
          Assignment Name
        </label>
        <input
          id="miniapp-assignment-name"
          {...tourTypeAttr('mini-app.session-name', 'miniApp')}
          type="text"
          value={assignmentName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="1st period"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-hidden focus:border-brand-blue-primary"
        />
      </div>
      <AssignTopSwitch
        value={kind}
        onChange={setKind}
        options={KIND_SWITCH_OPTIONS}
        ariaLabel="Student work"
        anchor={tourTypeAttr('mini-app.stepper-kind-switch', 'miniApp')}
      />
    </div>
  );

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={appTitle}
      topSwitch={topSwitch}
      steps={steps}
      submitLabel="Assign"
      submitting={submitting}
      disabled={nameMissing || backwards}
      disabledReason={
        backwards
          ? t('assignAvailability.closesBeforeOpens', 'Closes before it opens.')
          : undefined
      }
      onSubmit={() =>
        onSubmit(
          staff
            ? {
                kind,
                classes: { classIds: [], studentsByClass: {} },
                when,
                targeting: EMPTY_ASSIGN_TARGETING_VALUE,
                audience: 'staff',
              }
            : { kind, classes, when, targeting },
          resultsStepOn ? results : undefined
        )
      }
      overlayView={
        showMods ? (
          <ModificationsView
            activityTitle={appTitle}
            rosters={rosters}
            selectedRosterIds={classes.classIds}
            value={targeting}
            onChange={setTargeting}
            onBack={() => setShowMods(false)}
            quizMode={false}
          />
        ) : undefined
      }
    />
  );
};
