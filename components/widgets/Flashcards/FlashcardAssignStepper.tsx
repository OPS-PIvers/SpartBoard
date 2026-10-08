// Flashcards assign on the accordion stepper (docs/plans/ASSIGN_STEPPER.md D2, D4, D9, D12).
import React, { useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '@/context/AuthContextValue';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import { AssignTopSwitch } from '@/components/common/library/assignStepper/AssignTopSwitch';
import { KIND_SWITCH_OPTIONS } from '@/components/common/library/assignStepper/assignTopSwitchOptions';
import {
  getAssignSteps,
  getAssignStepTitle,
  type AssignKind,
  type AssignStepDef,
  type AssignStepId,
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
import { FlashcardsCheckStep } from '@/components/common/library/assignStepper/FlashcardsCheckStep';
import {
  formatFlashcardsCheckValue,
  type FlashcardsCheckValue,
} from '@/components/common/library/assignStepper/flashcardsCheckValue';
import { applyWhen } from '@/utils/assignAvailability';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import {
  getFlashcardAssignPrefill,
  useLastFlashcardAssignSettings,
} from '@/hooks/useLastFlashcardAssignSettings';
import {
  buildFlashcardAssignSubmission,
  rosterHasSsoClass,
  validateFlashcardAssignForm,
} from './utils/flashcardAssign';
import type { FlashcardAssignModalProps } from './FlashcardAssignModal';

export const FlashcardAssignStepper: React.FC<FlashcardAssignModalProps> = ({
  isOpen,
  set,
  rosters,
  initialRosterIds = [],
  onClose,
  onAssign,
  periodAccess,
}) => {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const lastUsed = useLastFlashcardAssignSettings(auth?.user?.uid, true);
  const cardCount = set.cards.length;

  const [kind, setKind] = useState<AssignKind>('work');
  const [classes, setClasses] = useState<AssignClassesValue>(() => ({
    classIds: initialRosterIds.filter((id) => rosters.some((r) => r.id === id)),
    studentsByClass: {},
  }));
  const [when, setWhen] = useState<AssignWhenValue>(() =>
    defaultWhenValue({
      activity: 'flashcards',
      bellAvailable: !!periodAccess,
      manualAvailable: !!periodAccess,
    })
  );
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [showMods, setShowMods] = useState(false);

  const [check, setCheck] = useState<FlashcardsCheckValue>(() => {
    const { collectSubmission: _kind, ...rules } = getFlashcardAssignPrefill(
      null,
      cardCount
    );
    return rules;
  });
  // Last-used rules land once, unless the teacher already changed a rule.
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && lastUsed.loaded) {
    setPrefilled(true);
    if (lastUsed.lastUsed) {
      const { collectSubmission: _kind, ...rules } = getFlashcardAssignPrefill(
        lastUsed.lastUsed,
        cardCount
      );
      setCheck(rules);
    }
  }
  const changeCheck = (next: FlashcardsCheckValue) => {
    setPrefilled(true);
    setCheck(next);
  };

  const form = { ...check, collectSubmission: kind === 'work' };
  const pickedRosters = useMemo(
    () =>
      rosters.filter((r) => !r.loadError && classes.classIds.includes(r.id)),
    [rosters, classes.classIds]
  );
  const formError = validateFlashcardAssignForm(form, cardCount);
  const hasSsoClass = pickedRosters.some(rosterHasSsoClass);
  const disabledReason =
    formError === 'no-cards'
      ? 'Add cards to this set before assigning it.'
      : formError === 'no-test-types'
        ? 'Choose at least one question type.'
        : !hasSsoClass
          ? 'Choose at least one ClassLink class.'
          : undefined;

  const ctx = { kind };
  const whenVariant = kind === 'resource' ? 'available' : 'when';
  const manualAvailable = whenVariant === 'when' && !!periodAccess;

  const bodies: Partial<
    Record<AssignStepId, { value: string; body: React.ReactNode }>
  > = {
    classes: {
      value: formatClassesValue(classes, rosters),
      body: (
        <div className="space-y-3">
          <ClassPickerMenu
            rosters={rosters}
            value={classes}
            onChange={setClasses}
          />
          <StudentPickMenu
            rosters={rosters}
            value={classes}
            onChange={setClasses}
          />
          <ModificationsLink
            rosters={rosters}
            selectedRosterIds={classes.classIds}
            value={targeting}
            onOpen={() => setShowMods(true)}
          />
        </div>
      ),
    },
    when: {
      value: formatWhenValue(when, {
        variant: whenVariant,
        rosterCount: pickedRosters.length,
        manualAvailable,
        t,
      }),
      body: (
        <AssignWhenStep
          value={when}
          onChange={setWhen}
          variant={whenVariant}
          rosters={pickedRosters}
          periodAccess={periodAccess}
        />
      ),
    },
    check: {
      value: formatFlashcardsCheckValue(check),
      body: (
        <FlashcardsCheckStep
          value={check}
          onChange={changeCheck}
          cardCount={cardCount}
        />
      ),
    },
  };

  const steps: AssignStepDef[] = getAssignSteps('flashcards', ctx).flatMap(
    (id) => {
      const step = bodies[id];
      return step
        ? [{ id, title: getAssignStepTitle(id, 'flashcards', ctx), ...step }]
        : [];
    }
  );

  const handleSubmit = async () => {
    const manualStart = manualAvailable && when.mode === 'manual';
    const resolved = applyWhen(
      { ...targeting, availability: when.availability },
      {
        mode: when.mode,
        rosters: pickedRosters,
        bellWindow: periodAccess?.bellWindow,
        workKind: { default: kind, locked: true },
      }
    );
    const ok = await onAssign(
      buildFlashcardAssignSubmission({
        set,
        form,
        rosters,
        rosterIds: classes.classIds,
        targeting: resolved.targeting,
        bellWindow: periodAccess?.bellWindow,
        classes,
        manualStart,
      })
    );
    if (ok !== false && kind === 'work') lastUsed.save(check);
  };

  const title = set.title || 'Untitled set';

  return (
    <AssignStepper
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      topSwitch={
        <AssignTopSwitch
          value={kind}
          onChange={setKind}
          options={KIND_SWITCH_OPTIONS}
          ariaLabel="Student work"
        />
      }
      steps={steps}
      submitLabel="Assign"
      onSubmit={handleSubmit}
      disabled={disabledReason !== undefined}
      disabledReason={disabledReason}
      // Flashcards opens maximized; z-dialog sits above a maximized widget.
      zIndex="z-dialog"
      overlayView={
        showMods ? (
          <ModificationsView
            activityTitle={title}
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
