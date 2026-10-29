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
  useAssignAudience,
  withAudienceSwitch,
} from '@/components/common/library/assignStepper/assignAudience';
import {
  defaultWhenValue,
  formatWhenValue,
  whenBackwards,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import { FlashcardsCheckStep } from '@/components/common/library/assignStepper/FlashcardsCheckStep';
import {
  formatFlashcardsCheckValue,
  type FlashcardsCheckValue,
} from '@/components/common/library/assignStepper/flashcardsCheckValue';
import { FlashcardsSpeakStep } from '@/components/common/library/assignStepper/FlashcardsSpeakStep';
import {
  DEFAULT_FLASHCARDS_SPEAK_VALUE,
  formatFlashcardsSpeakValue,
  type FlashcardsSpeakValue,
} from '@/components/common/library/assignStepper/flashcardsSpeakValue';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
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
  type FlashcardAssignSubmission,
} from './utils/flashcardAssign';
import type { ClassRoster, FlashcardSet } from '@/types';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';

export interface FlashcardAssignStepperProps {
  isOpen: boolean;
  set: FlashcardSet;
  rosters: ClassRoster[];
  initialRosterIds?: string[];
  onClose: () => void;
  /** Resolves false when the assign failed. */
  onAssign: (submission: FlashcardAssignSubmission) => Promise<boolean | void>;
  /** Per-period mode and windows; undefined while the flag is off. */
  periodAccess?: AssignPeriodAccessContext;
}

export const FlashcardAssignStepper: React.FC<FlashcardAssignStepperProps> = ({
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
  const [speak, setSpeak] = useState<FlashcardsSpeakValue>(
    DEFAULT_FLASHCARDS_SPEAK_VALUE
  );
  // F21: the same check the save-time stamp makes.
  const speakAvailable =
    (auth?.canAccessFeature('flashcards-speak') ?? false) &&
    speakLanguageOf(set.termLanguage) !== null;

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
  const audienceState = useAssignAudience();
  const staff = audienceState.audience === 'staff';
  const pickedRosters = useMemo(
    () =>
      staff
        ? []
        : rosters.filter(
            (r) => !r.loadError && classes.classIds.includes(r.id)
          ),
    [rosters, classes.classIds, staff]
  );
  const formError = validateFlashcardAssignForm(form, cardCount);
  const hasSsoClass = pickedRosters.some(rosterHasSsoClass);
  const disabledReason =
    formError === 'no-cards'
      ? 'Add cards to this set before assigning it.'
      : formError === 'no-test-types'
        ? 'Choose at least one question type.'
        : !hasSsoClass && !staff
          ? 'Choose at least one ClassLink class.'
          : whenBackwards(when, pickedRosters, periodAccess?.bellWindow, kind)
            ? t(
                'assignAvailability.closesBeforeOpens',
                'Closes before it opens.'
              )
            : undefined;

  const ctx = { kind, speak: speakAvailable };
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
            anchor={tourTypeAttr(
              'flashcards.stepper-class-picker',
              'flashcards'
            )}
            rowAnchor={(classId) =>
              tourFieldAttr(
                'flashcards.stepper-class-row',
                'flashcards',
                classId
              )
            }
          />
          <StudentPickMenu
            rosters={rosters}
            value={classes}
            onChange={setClasses}
            rowAnchor={(classId) =>
              tourFieldAttr(
                'flashcards.stepper-student-menu',
                'flashcards',
                classId
              )
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
    speak: {
      value: formatFlashcardsSpeakValue(speak, t),
      body: <FlashcardsSpeakStep value={speak} onChange={setSpeak} />,
    },
  };

  const steps: AssignStepDef[] = getAssignSteps('flashcards', ctx).flatMap(
    (id) => {
      const step = bodies[id];
      if (!step) return [];
      const def: AssignStepDef = {
        id,
        title:
          id === 'speak'
            ? t('flashcards.speak.assign.stepTitle', 'Speak')
            : getAssignStepTitle(id, 'flashcards', ctx),
        ...step,
      };
      return [id === 'classes' ? withAudienceSwitch(def, audienceState) : def];
    }
  );

  const handleSubmit = async () => {
    const manualStart = !staff && manualAvailable && when.mode === 'manual';
    const resolved = applyWhen(
      {
        ...(staff ? EMPTY_ASSIGN_TARGETING_VALUE : targeting),
        availability: when.availability,
      },
      {
        mode: when.mode,
        rosters: pickedRosters,
        bellWindow: periodAccess?.bellWindow,
        workKind: { default: kind, locked: true },
      }
    );
    const submission = buildFlashcardAssignSubmission({
      set,
      form,
      rosters,
      rosterIds: staff ? [] : classes.classIds,
      targeting: resolved.targeting,
      bellWindow: periodAccess?.bellWindow,
      classes: staff ? { classIds: [], studentsByClass: {} } : classes,
      manualStart,
    });
    if (staff) submission.input.audience = 'staff';
    const studySpeak = speakAvailable && kind === 'resource';
    const ok = await onAssign(
      studySpeak
        ? {
            ...submission,
            input: {
              ...submission.input,
              ...(speak.show
                ? { speakLocked: speak.lock }
                : { speakOff: true }),
            },
          }
        : submission
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
          anchor={tourTypeAttr('flashcards.stepper-kind-switch', 'flashcards')}
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
