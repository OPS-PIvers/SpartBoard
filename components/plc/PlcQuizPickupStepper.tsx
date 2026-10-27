// "Assign to my classes" on a teammate's PLC quiz: the Quiz assign stepper before anything is created.
import React, { useRef, useState } from 'react';
import type { QuizBehaviorSettings } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAssignPeriodAccess } from '@/hooks/useTeacherBellPeriods';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import { manualStartAvailable } from '@/utils/assignAvailability';
import { toAssessmentBehavior } from '@/utils/quizBehavior';
import type { AssignClassesValue } from '@/utils/assignTargets';
import {
  defaultWhenValue,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import {
  planPlcQuizStepperAssign,
  type PlcQuizStepperPlan,
} from './plcQuizStepperAssign';

interface PlcQuizPickupStepperProps {
  title: string;
  initialBehavior: QuizBehaviorSettings;
  onClose: () => void;
  /** Creates the assignment; a rejection keeps the stepper open for a retry. */
  onAssign: (
    plan: PlcQuizStepperPlan,
    behavior: QuizBehaviorSettings
  ) => Promise<void>;
}

export const PlcQuizPickupStepper: React.FC<PlcQuizPickupStepperProps> = ({
  title,
  initialBehavior,
  onClose,
  onAssign,
}) => {
  const { rosters, updateRoster } = useDashboard();
  const periodAccess = useAssignPeriodAccess(updateRoster);
  const handRaiseMode = useQuizHandRaiseMode();
  const [classes, setClasses] = useState<AssignClassesValue>({
    classIds: [],
    studentsByClass: {},
  });
  const [editedWhen, setWhen] = useState<AssignWhenValue | null>(null);
  const when =
    editedWhen ??
    defaultWhenValue({
      activity: 'quiz',
      bellAvailable: !!periodAccess,
      manualAvailable: manualStartAvailable(periodAccess?.bellWindow),
    });
  const [behavior, setBehavior] =
    useState<QuizBehaviorSettings>(initialBehavior);
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const plan = planPlcQuizStepperAssign({
        classes,
        when,
        rosters,
        bellWindow: periodAccess?.bellWindow,
      });
      await onAssign(plan, toAssessmentBehavior(behavior));
      onClose();
    } catch {
      // The caller already toasted the failure; keep the stepper open.
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <QuizAssignStepper
      title={title}
      rosters={rosters}
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      periodAccess={periodAccess}
      hasManualGrading={false}
      handRaiseMode={handRaiseMode}
      submitLabel="Assign"
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
};
