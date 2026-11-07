// Flashcards assign on the accordion stepper (docs/plans/shipped/ASSIGN_STEPPER.md D2, D4, D9, D12).
import React, { useContext, useEffect, useMemo, useState } from 'react';
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
  formatFlashcardsModeValue,
  type FlashcardsCheckValue,
} from '@/components/common/library/assignStepper/flashcardsCheckValue';
import { useQuizRuleGates } from '@/components/common/library/assignStepper/QuizRuleStepGates';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import { resolveQuizHandRaiseEnabled } from '@/utils/quizHandRaise';
import { quizRuleStepDefs } from '@/components/common/library/assignStepper/quizRuleStepDefs';
import {
  behaviorToFlashcardRules,
  flashcardRulesToBehavior,
  rulesFromScoreVisibility,
  scoreVisibilityFromRules,
} from '@/components/common/library/assignStepper/flashcardsRuleValues';
import { legacyFlashcardVisibility } from '@/utils/flashcardResultsVisibility';
import { SharingStep } from '@/components/common/library/assignStepper/SharingStep';
import {
  formatSharingValue,
  isSharingStepAvailable,
  PICK_A_PLC,
  resolveSharingPlc,
  sharingNeedsPlc,
  type SharingStepValue,
} from '@/components/common/library/assignStepper/SharingStep.format';
import { FlashcardsCardsStep } from '@/components/common/library/assignStepper/FlashcardsCardsStep';
import {
  DEFAULT_FLASHCARDS_CARDS_VALUE,
  formatFlashcardsCardsValue,
  resolveSelectedCards,
  selectedCardCount,
  type FlashcardsCardsValue,
} from '@/components/common/library/assignStepper/flashcardsCardsValue';
import { FlashcardsSpeakStep } from '@/components/common/library/assignStepper/FlashcardsSpeakStep';
import {
  DEFAULT_FLASHCARDS_SPEAK_VALUE,
  formatFlashcardsSpeakValue,
  type FlashcardsSpeakValue,
} from '@/components/common/library/assignStepper/flashcardsSpeakValue';
import { FlashcardsSpeakRules } from '@/components/common/library/assignStepper/FlashcardsSpeakRules';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { readFlashcardsSpeakAdminConfig } from '@/hooks/useFlashcardSets';
import { initialAssignSpeakSettings } from './speak/speakEditorState';
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
import type {
  ClassRoster,
  FlashcardCard,
  FlashcardCheckRules,
  FlashcardSet,
  FlashcardSpeakChoice,
  FlashcardSpeakSettings,
  FlashcardsSpeakAdminConfig,
  Plc,
} from '@/types';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';

export interface FlashcardAssignStepperProps {
  isOpen: boolean;
  set: FlashcardSet;
  rosters: ClassRoster[];
  initialRosterIds?: string[];
  onClose: () => void;
  /** Resolves false when the assign failed. */
  onAssign: (
    submission: FlashcardAssignSubmission,
    extras?: FlashcardAssignExtras
  ) => Promise<boolean | void>;
  /** Per-period mode and windows; undefined while the flag is off. */
  periodAccess?: AssignPeriodAccessContext;
  /** PLCs the teacher can share results with on a Check's Sharing step. */
  plcs?: readonly Plc[];
}

/** What a Check submits beyond the input: the PLC to share results with, if any. */
export interface FlashcardAssignExtras {
  sharePlc?: Plc;
}

// Drops card-subset ids the assignment no longer has; a subset left empty or whole is cleared.
const fitCardSubsets = (
  targeting: AssignTargetingValue,
  assigned: FlashcardCard[]
): AssignTargetingValue => {
  const ids = new Set(assigned.map((card) => card.id));
  const overridesByKey = Object.fromEntries(
    Object.entries(targeting.overridesByKey).map(([key, override]) => {
      if (!override.questionIds) return [key, override];
      const { questionIds, ...rest } = override;
      const kept = questionIds.filter((id) => ids.has(id));
      return [
        key,
        kept.length > 0 && kept.length < ids.size
          ? { ...rest, questionIds: kept }
          : rest,
      ];
    })
  );
  return { ...targeting, overridesByKey };
};

export const FlashcardAssignStepper: React.FC<FlashcardAssignStepperProps> = ({
  isOpen,
  set,
  rosters,
  initialRosterIds = [],
  onClose,
  onAssign,
  periodAccess,
  plcs = [],
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
      manualAvailable: true,
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
  const [cards, setCards] = useState<FlashcardsCardsValue>(
    DEFAULT_FLASHCARDS_CARDS_VALUE
  );

  const [check, setCheck] = useState<FlashcardsCheckValue>(() => {
    const {
      collectSubmission: _kind,
      rules: _rules,
      ...form
    } = getFlashcardAssignPrefill(null, cardCount);
    return form;
  });
  const [rules, setRules] = useState<FlashcardCheckRules>(() =>
    rulesFromScoreVisibility(check.scoreVisibility)
  );
  // Last-used rules land once, unless the teacher already changed a rule.
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && lastUsed.loaded) {
    setPrefilled(true);
    if (lastUsed.lastUsed) {
      const {
        collectSubmission: _kind,
        rules: savedRules,
        ...form
      } = getFlashcardAssignPrefill(lastUsed.lastUsed, cardCount);
      setCheck(form);
      setRules(savedRules ?? rulesFromScoreVisibility(form.scoreVisibility));
    }
  }
  const changeCheck = (next: FlashcardsCheckValue) => {
    setPrefilled(true);
    setCheck(next);
  };
  const changeRules = (next: FlashcardCheckRules) => {
    setPrefilled(true);
    setRules(next);
  };
  // Speak's rules are picked here, starting from the district defaults.
  const speakLanguage = speakLanguageOf(set.termLanguage);
  const speakRulesOn = speakAvailable && speakLanguage !== null;
  const [speakAdmin, setSpeakAdmin] =
    useState<FlashcardsSpeakAdminConfig | null>(null);
  useEffect(() => {
    if (!isOpen || !speakRulesOn) return;
    let live = true;
    void readFlashcardsSpeakAdminConfig().then((config) => {
      if (live) setSpeakAdmin(config);
    });
    return () => {
      live = false;
    };
  }, [isOpen, speakRulesOn]);
  const [speakRules, setSpeakRules] = useState<FlashcardSpeakSettings | null>(
    null
  );
  const [speakSeeded, setSpeakSeeded] = useState(false);
  if (!speakSeeded && speakAdmin && lastUsed.loaded) {
    setSpeakSeeded(true);
    setSpeakRules(
      initialAssignSpeakSettings(
        set.termLanguage,
        set.speak,
        speakAdmin,
        lastUsed.lastUsed?.speak ?? null
      )
    );
  }
  const speakRulesBody =
    speakRulesOn && speakRules && speakLanguage ? (
      <FlashcardsSpeakRules
        language={speakLanguage}
        value={speakRules}
        onChange={setSpeakRules}
      />
    ) : undefined;
  const gates = useQuizRuleGates();
  const handRaiseMode = useQuizHandRaiseMode();
  // Rows a flag hides are not stamped, as in Quiz; the district's raise-hand rule wins over the switch.
  const stampedRules: FlashcardCheckRules = (() => {
    const { timeLimitMinutes, handRaiseEnabled, ...sessionOptions } =
      rules.sessionOptions;
    return {
      ...rules,
      sessionOptions: {
        ...sessionOptions,
        ...(gates.timeLimitOn && timeLimitMinutes != null
          ? { timeLimitMinutes }
          : {}),
        ...(resolveQuizHandRaiseEnabled(handRaiseMode, handRaiseEnabled)
          ? { handRaiseEnabled: true }
          : {}),
      },
    };
  })();

  const effectiveCheck: FlashcardsCheckValue =
    check.checkMode === 'speak' && !speakAvailable
      ? { ...check, checkMode: 'flashcards' }
      : check;
  const form = { ...effectiveCheck, collectSubmission: kind === 'work' };
  const useCardChoice = kind === 'work';
  const chosenCount = useCardChoice
    ? selectedCardCount(cards, set.cards)
    : cardCount;
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
  const formError = validateFlashcardAssignForm(
    form,
    cardCount === 0 ? 0 : chosenCount || cardCount
  );
  const hasSsoClass = pickedRosters.some(rosterHasSsoClass);
  const disabledReason =
    formError === 'no-cards'
      ? 'Add cards to this set before assigning it.'
      : chosenCount === 0
        ? 'Choose at least one card.'
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

  const inPlc = isSharingStepAvailable(plcs, kind);
  const [sharing, setSharing] = useState<SharingStepValue>({
    plcMode: false,
    plcId: '',
  });
  const needsPlc = inPlc && sharingNeedsPlc(sharing, plcs);
  const ctx = { kind, speak: speakAvailable, inPlc };
  const whenVariant = kind === 'resource' ? 'available' : 'when';
  const manualAvailable = whenVariant === 'when' && !staff;

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
          manualAvailable={manualAvailable}
        />
      ),
    },
    cards: {
      value: formatFlashcardsCardsValue(cards, set.cards),
      body: (
        <FlashcardsCardsStep
          value={cards}
          onChange={setCards}
          cards={set.cards}
        />
      ),
    },
    check: {
      value: formatFlashcardsModeValue(effectiveCheck),
      body: (
        <FlashcardsCheckStep
          value={effectiveCheck}
          onChange={changeCheck}
          cardCount={chosenCount}
          speakAvailable={speakAvailable}
          speakRules={
            speakRulesOn && speakRules && speakLanguage ? (
              <FlashcardsSpeakRules
                language={speakLanguage}
                value={speakRules}
                onChange={setSpeakRules}
                placement="check-step"
              />
            ) : undefined
          }
        />
      ),
    },
    sharing: {
      value: needsPlc ? PICK_A_PLC : formatSharingValue(sharing, { plcs }),
      body: <SharingStep value={sharing} onChange={setSharing} plcs={plcs} />,
    },
    speak: {
      value: formatFlashcardsSpeakValue(speak, t),
      body: (
        <FlashcardsSpeakStep
          value={speak}
          onChange={setSpeak}
          rules={speakRulesBody}
        />
      ),
    },
  };

  const ruleSteps = new Map(
    quizRuleStepDefs({
      value: flashcardRulesToBehavior(rules),
      onChange: (next) => changeRules(behaviorToFlashcardRules(next)),
      gates,
      handRaiseMode,
      flashcards: true,
    }).map((step) => [step.id, step])
  );

  const steps: AssignStepDef[] = getAssignSteps('flashcards', ctx).flatMap(
    (id) => {
      const ruleStep = ruleSteps.get(id);
      if (ruleStep) return [ruleStep];
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
        manualAvailable,
        rosters: pickedRosters,
        bellWindow: periodAccess?.bellWindow,
        workKind: { default: kind, locked: true },
      }
    );
    const assignedSet = useCardChoice
      ? { ...set, cards: resolveSelectedCards(cards, set.cards) }
      : set;
    const submission = buildFlashcardAssignSubmission({
      set: assignedSet,
      form: useCardChoice ? { ...form, testCount: 'all' } : form,
      rosters,
      rosterIds: staff ? [] : classes.classIds,
      targeting: useCardChoice
        ? fitCardSubsets(resolved.targeting, assignedSet.cards)
        : resolved.targeting,
      bellWindow: periodAccess?.bellWindow,
      classes: staff ? { classIds: [], studentsByClass: {} } : classes,
      manualStart,
    });
    if (staff) submission.input.audience = 'staff';
    if (useCardChoice && cards.mode !== 'all') {
      submission.input.cardSelection = cards;
    }
    if (useCardChoice) {
      submission.input.rules = stampedRules;
      submission.input.scoreVisibility = scoreVisibilityFromRules(rules);
      if (submission.input.lockedSettings) {
        submission.input.lockedSettings = {
          ...submission.input.lockedSettings,
          shuffle: rules.sessionOptions.shuffleQuestions === true,
        };
      }
    }
    const speakUsed =
      kind === 'resource' ? speak.show : effectiveCheck.checkMode === 'speak';
    const speakChoice: FlashcardSpeakChoice | undefined =
      speakRulesBody && speakRules && speakUsed
        ? {
            preset: speakRules.preset,
            strict: speakRules.strict,
            groups: speakRules.groups,
            attempts: speakRules.attempts,
            example: speakRules.example,
          }
        : undefined;
    if (speakChoice) submission.input.speakChoice = speakChoice;
    const sharePlc =
      inPlc && sharing.plcMode
        ? (resolveSharingPlc(sharing, plcs) ?? undefined)
        : undefined;
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
        : submission,
      sharePlc ? { sharePlc } : undefined
    );
    const lastSpeak = speakChoice
      ? {
          preset: speakChoice.preset,
          strict: speakChoice.strict,
          attempts: speakChoice.attempts,
          example: speakChoice.example,
          ...(speakChoice.preset === 'custom'
            ? { groups: speakChoice.groups }
            : {}),
        }
      : lastUsed.lastUsed?.speak;
    if (ok !== false && kind === 'work') {
      lastUsed.save({
        ...check,
        scoreVisibility: legacyFlashcardVisibility(
          scoreVisibilityFromRules(rules)
        ),
        rules: stampedRules,
        ...(lastSpeak ? { speak: lastSpeak } : {}),
      });
    } else if (ok !== false && speakChoice && lastSpeak) {
      const { collectSubmission: _kind, ...defaults } =
        getFlashcardAssignPrefill(null, cardCount);
      lastUsed.save({ ...(lastUsed.lastUsed ?? defaults), speak: lastSpeak });
    }
  };

  const title = set.title || 'Untitled set';
  // The per-student card subset picks from the cards this assignment uses.
  const modCards = useCardChoice
    ? resolveSelectedCards(cards, set.cards).map((card) => ({
        id: card.id,
        label: card.term || card.definition,
      }))
    : [];

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
      disabled={disabledReason !== undefined || needsPlc}
      disabledReason={disabledReason ?? (needsPlc ? PICK_A_PLC : undefined)}
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
            {...(useCardChoice
              ? {
                  flashcardsMode: true,
                  pageProtectionsAvailable: true,
                  quizContext: { questions: modCards, rubrics: [] },
                  answerChoicesAvailable:
                    effectiveCheck.checkMode === 'test' &&
                    effectiveCheck.testTypes.includes('mc') &&
                    modCards.length >= 4,
                }
              : {})}
          />
        ) : undefined
      }
    />
  );
};
