// Video Activity on the assign stepper: pacing switch, Classes, When, Sharing (docs/plans/ASSIGN_STEPPER.md D4).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Play } from 'lucide-react';
import type {
  ClassRoster,
  Plc,
  StudentTargetRef,
  VideoActivitySessionMode,
} from '@/types';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import { applyWhen, manualStartAvailable } from '@/utils/assignAvailability';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { AssignStepper } from './AssignStepper';
import { AssignTopSwitch } from './AssignTopSwitch';
import { PACING_SWITCH_OPTIONS } from './assignTopSwitchOptions';
import {
  getAssignStepTitle,
  getAssignSteps,
  type AssignStepDef,
  type AssignStepId,
} from './assignSteps';
import { ClassPickerMenu } from './ClassPickerMenu';
import { StudentPickMenu } from './StudentPickMenu';
import {
  formatClassesValue,
  type AssignClassesValue,
} from './assignClassesValue';
import { initialClassesValue } from './VideoAssignStepper.helpers';
import { ModificationsLink, ModificationsView } from './ModificationsView';
import { AssignWhenStep } from './AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  type AssignWhenValue,
} from './assignWhenValue';
import { SharingStep } from './SharingStep';
import {
  formatSharingValue,
  isSharingStepAvailable,
  resolveSharingPlc,
  type SharingStepValue,
} from './SharingStep.format';
import { tourAttr } from '@/config/tourAnchors';

export interface VideoAssignStepperResult {
  pacing: VideoActivitySessionMode;
  /** Picked classes; live keeps one class and no student picks. */
  classes: AssignClassesValue;
  /** Modifications plus the resolved When (windows, or the Manual period plan). */
  targeting: AssignTargetingValue;
  /** Manual: every class starts closed until the teacher starts it. */
  manualStart: boolean;
  /** The PLC to share results with, or null. */
  plc: Plc | null;
}

export interface VideoAssignStepperProps {
  onClose: () => void;
  title: string;
  rosters: ClassRoster[];
  periodAccess?: AssignPeriodAccessContext;
  plcs: readonly Plc[];
  /** `video-activity-live`: shows the pacing switch. */
  canAssignLive: boolean;
  /** Last-used pacing (D12); null falls back to self-paced. */
  lastPacing: VideoActivitySessionMode | null;
  initialClassIds: string[];
  /** A make-up assign's students; sorted into their classes. */
  initialStudents?: StudentTargetRef[];
  error?: string | null;
  onSubmit: (result: VideoAssignStepperResult) => Promise<void>;
}

export const VideoAssignStepper: React.FC<VideoAssignStepperProps> = ({
  onClose,
  title,
  rosters,
  periodAccess,
  plcs,
  canAssignLive,
  lastPacing,
  initialClassIds,
  initialStudents,
  error,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const visibleRosters = useMemo(
    () => rosters.filter((r) => !r.loadError),
    [rosters]
  );
  // null until the teacher picks, so a last-used value that loads late still applies.
  const [pickedPacing, setPickedPacing] =
    useState<VideoActivitySessionMode | null>(null);
  const pacing: VideoActivitySessionMode = canAssignLive
    ? (pickedPacing ?? lastPacing ?? 'student')
    : 'student';
  const live = pacing === 'teacher';

  const [classesState, setClasses] = useState<AssignClassesValue>(() =>
    initialClassesValue(rosters, initialClassIds, initialStudents)
  );
  // Live is one whole class (D5a).
  const classes: AssignClassesValue = live
    ? { classIds: classesState.classIds.slice(0, 1), studentsByClass: {} }
    : classesState;
  const pickedRosters = visibleRosters.filter((r) =>
    classes.classIds.includes(r.id)
  );

  const manualAvailable = manualStartAvailable(periodAccess?.bellWindow);
  const [when, setWhen] = useState<AssignWhenValue>(() =>
    defaultWhenValue({
      activity: 'video',
      bellAvailable: !!periodAccess,
      manualAvailable,
    })
  );
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [sharing, setSharing] = useState<SharingStepValue>({
    plcMode: false,
    plcId: '',
  });
  const [modsOpen, setModsOpen] = useState(false);

  const sharingOn = isSharingStepAvailable(plcs, 'work');
  const sharedPlc = sharing.plcMode ? resolveSharingPlc(sharing, plcs) : null;
  const plcMissing = sharingOn && sharing.plcMode && !sharedPlc;

  const ctx = { kind: 'work' as const, live, inPlc: sharingOn };
  const variant = live ? 'live' : 'when';

  const bodies: Record<AssignStepId, () => AssignStepDef | null> = {
    classes: () => ({
      id: 'classes',
      title: getAssignStepTitle('classes', 'video', ctx),
      value: formatClassesValue(classes, visibleRosters),
      body: (
        <div className="space-y-3">
          <ClassPickerMenu
            rosters={visibleRosters}
            value={classes}
            onChange={setClasses}
            singleSelect={live}
          />
          {!live && (
            <>
              <StudentPickMenu
                rosters={visibleRosters}
                value={classes}
                onChange={setClasses}
              />
              <ModificationsLink
                rosters={visibleRosters}
                selectedRosterIds={classes.classIds}
                value={targeting}
                onOpen={() => setModsOpen(true)}
              />
            </>
          )}
        </div>
      ),
    }),
    when: () => ({
      id: 'when',
      title: getAssignStepTitle('when', 'video', ctx),
      value: formatWhenValue(when, {
        variant,
        rosterCount: pickedRosters.length,
        manualAvailable,
        t,
      }),
      body: (
        <AssignWhenStep
          value={when}
          onChange={setWhen}
          variant={variant}
          rosters={pickedRosters}
          periodAccess={periodAccess}
        />
      ),
    }),
    sharing: () => ({
      id: 'sharing',
      title: getAssignStepTitle('sharing', 'video', ctx),
      value: formatSharingValue(sharing, { plcs }),
      body: <SharingStep value={sharing} onChange={setSharing} plcs={plcs} />,
    }),
    attempts: () => null,
    integrity: () => null,
    feedback: () => null,
    check: () => null,
  };
  const steps = getAssignSteps('video', ctx)
    .map((id) => bodies[id]())
    .filter((s): s is AssignStepDef => s !== null);

  const submit = async () => {
    const manualStart = !live && when.mode === 'manual' && manualAvailable;
    const resolved = live
      ? EMPTY_ASSIGN_TARGETING_VALUE
      : applyWhen(
          { ...targeting, availability: when.availability },
          {
            mode: when.mode,
            rosters: pickedRosters,
            bellWindow: periodAccess?.bellWindow,
          }
        ).targeting;
    await onSubmit({
      pacing,
      classes,
      targeting: resolved,
      manualStart,
      plc: sharedPlc,
    });
  };

  const topSwitch =
    canAssignLive || error ? (
      <div className="space-y-3">
        {canAssignLive && (
          <AssignTopSwitch
            value={pacing}
            onChange={setPickedPacing}
            options={PACING_SWITCH_OPTIONS}
            ariaLabel="Pacing"
            anchor={tourAttr('assign-top.pacing')}
          />
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 px-3 py-2 text-sm font-medium text-brand-red-dark">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    ) : undefined;

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={title}
      topSwitch={topSwitch}
      steps={steps}
      submitLabel={live ? 'Start live' : 'Assign'}
      submitIcon={live ? Play : undefined}
      onSubmit={submit}
      disabled={plcMissing}
      disabledReason={plcMissing ? 'Pick a PLC to share with' : undefined}
      overlayView={
        modsOpen && !live ? (
          <ModificationsView
            activityTitle={title}
            rosters={visibleRosters}
            selectedRosterIds={classes.classIds}
            value={targeting}
            onChange={setTargeting}
            onBack={() => setModsOpen(false)}
            quizMode={false}
          />
        ) : undefined
      }
    />
  );
};
