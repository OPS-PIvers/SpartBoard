/**
 * PlcNewQuizAssignmentModal — in-tab "+ Assign Quiz" wizard for the PLC
 * dashboard's Assignments → Library sub-tab.
 *
 * Two-step flow:
 *
 *   1. Pick a quiz from the teacher's personal library
 *      (reuses `PlcSharePickerModal`).
 *   2. The Quiz assign stepper, prefilled from the teacher's last-used rules.
 *
 * On submit:
 *
 *   a. Build the `PlcLinkage` (`id`, `name`, `memberEmails`). No Google Sheet
 *      step — pooled results come from the server-side PLC pipeline
 *      (docs/plans/shipped/PLC_ASSESSMENT_DATA.md); a sheet can be added from Results.
 *   b. If the source quiz has no `sync.groupId`, mint one with `plcId` set,
 *      attach the sync linkage to the local quiz, and pass the new id through
 *      as `plcTemplateSyncGroupId` so teammates who "Add to my board" land on
 *      the same canonical content.
 *   c. `createAssignment` with `settings.plc` set; the hook stamps the session
 *      with `plcId`/`syncGroupId` and writes the PLC template.
 *
 * Known orphan-group gap: if (c) fails after (b) succeeded the personal copy
 * keeps a self-only sync linkage. There's no `detachSyncLinkage` API today, so
 * we log under `newPlcAssignment.orphanedGroup` and surface a toast.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssignmentMode,
  Plc,
  PlcLinkage,
  QuizBehaviorSettings,
  QuizMetadata,
  QuizSessionOptions,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useBankSources } from '@/hooks/useBankSources';
import { resolveQuizAssignContent } from '@/utils/quizAssignBankDraw';
import {
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
} from '@/hooks/useSyncedQuizGroups';
import { getPlcMemberEmails } from '@/utils/plc';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';
import { resolvePlcPoolSyncGroupId } from '@/utils/plcPooling';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { logError } from '@/utils/logError';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { useLastQuizAssignSettings } from '@/hooks/useLastQuizAssignSettings';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from './PlcSharePickerModal';
import { formatShortDate } from './newAssignmentHelpers';
import { useViewAsOutward, VIEW_AS_WRITES } from '@/hooks/useViewAsOutward';
import { syncedQuizContentFields } from '@/utils/syncedQuizContent';
import { toAssessmentBehavior } from '@/utils/quizBehavior';
import { manualStartAvailable } from '@/utils/assignAvailability';
import type { AssignClassesValue } from '@/utils/assignTargets';
import { buildMixedTargetsPayload } from '@/utils/assignTargets';
import { payloadRequiresCall } from '@/utils/studentTargetRef';
import { dueAtByClassIdFromRosters } from '@/utils/perClassDueDates';
import { useSetAssignmentTargets } from '@/hooks/useSetAssignmentTargets';
import { useAssignPeriodAccess } from '@/hooks/useTeacherBellPeriods';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import { skippedTargetsToastMessage } from '@/utils/assignTargetingSkippedToast';
import {
  defaultWhenValue,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { planPlcQuizStepperAssign } from './plcQuizStepperAssign';

interface PlcNewQuizAssignmentModalProps {
  plc: Plc;
  /**
   * Org-wide assignment mode frozen onto the new assignment + session.
   * Defaults to `'submissions'`. The PLC dashboard reads it from the
   * authenticated teacher's `appSettings` and forwards it here so the
   * new assignment matches every other assignment created in this org.
   */
  assignmentMode?: AssignmentMode;
  onClose: () => void;
  /**
   * Fired after the assignment write + index write commit. The parent
   * uses this to surface a follow-up toast and to optionally chain
   * straight into the post-create "Edit all settings…" hand-off.
   */
  onCreated?: (info: { assignmentId: string; quizTitle: string }) => void;
}

export const PlcNewQuizAssignmentModal: React.FC<
  PlcNewQuizAssignmentModalProps
> = ({ plc, assignmentMode = 'submissions', onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  // D21: the stepper uses the Quiz steps, prefilled from and saving to last-used rules.
  const { lastUsed: lastAssignSettings, save: saveLastAssignSettings } =
    useLastQuizAssignSettings(user?.uid, true);
  const [editedAssignSettings, setEditedAssignSettings] =
    useState<QuizBehaviorSettings | null>(null);
  const splitAssignSettings = useMemo(
    () => editedAssignSettings ?? getQuizAssignPrefill(lastAssignSettings),
    [editedAssignSettings, lastAssignSettings]
  );
  const { addToast, rosters, updateRoster } = useDashboard();
  const periodAccess = useAssignPeriodAccess(updateRoster);
  const handRaiseMode = useQuizHandRaiseMode();
  const { setAssignmentTargets } = useSetAssignmentTargets();
  const [stepperClasses, setStepperClasses] = useState<AssignClassesValue>({
    classIds: [],
    studentsByClass: {},
  });
  const [stepperWhen, setStepperWhen] = useState<AssignWhenValue | null>(null);
  const {
    quizzes,
    loadQuizData,
    saveDriveSnapshot,
    attachSyncLinkage,
    isDriveConnected,
  } = useQuiz(user?.uid);
  const { loadBankContentsForQuiz } = useBankSources(user?.uid);
  const { createAssignment, setAssignmentTargetSkippedCount } =
    useQuizAssignments(user?.uid);
  // PLC library, used to pool this run with an existing group of the same title.
  const { quizzes: plcLibrary } = usePlcQuizzes(plc.id);

  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [pickedQuiz, setPickedQuiz] = useState<QuizMetadata | null>(null);
  // Synchronous submit guard. State alone isn't enough — a double-click
  // can fire two submit handlers before React commits the first
  // setState. See `PlcSharePickerModal.handlePick` for the same pattern.
  const submittingRef = useRef(false);
  const outward = useViewAsOutward();
  const [submitting, setSubmitting] = useState(false);

  const pickerItems: PlcSharePickerItem[] = useMemo(
    () =>
      quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        metaLine: t('plcDashboard.newAssignment.quiz.metaLine', {
          count: quiz.questionCount ?? 0,
          date: formatShortDate(quiz.updatedAt ?? quiz.createdAt ?? 0),
          defaultValue: '{{count}} questions · {{date}}',
        }),
      })),
    [quizzes, t]
  );

  const handlePick = useCallback(
    (quizId: string): Promise<void> => {
      const meta = quizzes.find((q) => q.id === quizId);
      if (!meta) {
        addToast(
          t('plcDashboard.newAssignment.quiz.missingFromLibrary', {
            defaultValue: 'That quiz is no longer in your library.',
          }),
          'error'
        );
        return Promise.resolve();
      }
      // A quiz still missing answers can't be scored, so it can't go to a PLC
      // where a teammate would assign it (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D6).
      const unanswered = meta.needsKeyCount ?? 0;
      if (unanswered > 0) {
        addToast(
          t('plcDashboard.newAssignment.quiz.needsAnswers', {
            count: unanswered,
            defaultValue:
              '{{count}} question still needs an answer. Open the quiz and fill it in before you share it.',
            defaultValue_other:
              '{{count}} questions still need an answer. Open the quiz and fill them in before you share it.',
          }),
          'error'
        );
        return Promise.resolve();
      }
      setPickedQuiz(meta);
      setStepperWhen(
        defaultWhenValue({
          activity: 'quiz',
          bellAvailable: !!periodAccess,
          manualAvailable: manualStartAvailable(periodAccess?.bellWindow),
        })
      );
      setStep('configure');
      return Promise.resolve();
    },
    [addToast, quizzes, t, periodAccess]
  );

  // `confirmed`: the stepper already asked the View as confirm.
  const handleSubmit = useCallback(
    async (confirmed = false) => {
      if (submittingRef.current || outward.locked) return;
      if (!pickedQuiz || !user || !stepperWhen) return;
      if (
        outward.active &&
        !confirmed &&
        !(await outward.confirm('Create assignment', VIEW_AS_WRITES.assign))
      )
        return;
      submittingRef.current = true;
      setSubmitting(true);

      let createdSyncGroupId: string | null = null;
      let linkageAttached = false;
      try {
        // Load Drive content up front so a sync-group mint never lands
        // without questions, and so any Drive auth issue surfaces a toast
        // before we touch shared state.
        const data = await loadQuizData(pickedQuiz.driveFileId);
        // Before any PLC sync writes, so a bank problem can't leave a half-made group.
        const content = await resolveQuizAssignContent(
          data,
          pickedQuiz.driveFileId,
          { loadBankContentsForQuiz, saveDriveSnapshot }
        );

        const stepperPlan = planPlcQuizStepperAssign({
          classes: stepperClasses,
          when: stepperWhen,
          rosters,
          bellWindow: periodAccess?.bellWindow,
        });
        const derived = deriveSessionTargetsFromRosters(stepperPlan.rosters);

        // PLC link only — no sheet step; results pool server-side.
        const plcLinkage: PlcLinkage = {
          id: plc.id,
          name: plc.name,
          memberEmails: getPlcMemberEmails(plc),
        };

        // Promote-to-synced: if the source quiz has no `sync.groupId`,
        // mint one with `plcId` set so peer importers landing on the PLC
        // template can read the canonical group. Mirrors the QuizWidget
        // `plcLinkage && !plcTemplateSyncGroupId` branch.
        let plcTemplateSyncGroupId: string | undefined =
          pickedQuiz.sync?.groupId;
        if (!plcTemplateSyncGroupId) {
          const newSyncGroupId = crypto.randomUUID();
          try {
            await createSyncedQuizGroup({
              groupId: newSyncGroupId,
              uid: user.uid,
              title: data.title,
              questions: data.questions,
              ...syncedQuizContentFields(data),
              plcId: plc.id,
              behavior: pickedQuiz.behavior,
            });
            createdSyncGroupId = newSyncGroupId;
            try {
              await attachSyncLinkage(pickedQuiz.id, {
                groupId: newSyncGroupId,
                lastSyncedVersion: 1,
              });
              linkageAttached = true;
              plcTemplateSyncGroupId = newSyncGroupId;
            } catch (linkageErr) {
              // Roll back the freshly-minted self-participant entry so we
              // don't leak a phantom participant pointing at a local
              // library that never recorded the linkage. The empty group
              // doc itself stays (rules disallow client deletes).
              try {
                await callLeaveSyncedQuizGroup(newSyncGroupId);
              } catch (leaveErr) {
                logError(
                  'PlcNewQuizAssignmentModal.promoteSync.rollbackLeave',
                  leaveErr,
                  { plcId: plc.id, syncGroupId: newSyncGroupId }
                );
              }
              // We deliberately don't throw — without a sync group we skip
              // the PLC template write, but the assignment still commits.
              logError(
                'PlcNewQuizAssignmentModal.promoteSync.attachLinkage',
                linkageErr,
                { plcId: plc.id, quizId: pickedQuiz.id }
              );
              plcTemplateSyncGroupId = undefined;
            }
          } catch (createErr) {
            logError(
              'PlcNewQuizAssignmentModal.promoteSync.create',
              createErr,
              {
                plcId: plc.id,
                quizId: pickedQuiz.id,
              }
            );
            plcTemplateSyncGroupId = undefined;
          }
        }

        const behavior = toAssessmentBehavior(splitAssignSettings);
        const stepperTargeting = stepperPlan.mixed.targeting;
        const effectiveDueAt = stepperPlan.dueAt;
        const sessionOptions: QuizSessionOptions = behavior.sessionOptions;

        // Title-aware pooling (§8.1): prefer the PLC library group so every
        // teacher's run of one quiz lands in a single assessment.
        const plcPoolSyncGroupId = resolvePlcPoolSyncGroupId({
          quizSyncGroupId: pickedQuiz.sync?.groupId,
          quizTitle: pickedQuiz.title,
          libraryEntries: plcLibrary.filter((entry) => !entry.archived),
        });

        const { id: assignmentId } = await createAssignment(
          {
            id: pickedQuiz.id,
            title: pickedQuiz.title,
            driveFileId: content.driveFileId,
            questions: content.questions,
            ...(content.stimuli ? { stimuli: content.stimuli } : {}),
            ...(data.language ? { language: data.language } : {}),
            ...(data.sections?.length
              ? { order: data.order, sections: data.sections }
              : {}),
          },
          {
            sessionMode: behavior.sessionMode,
            sessionOptions,
            attemptLimit: behavior.attemptLimit,
            teacherName: user.displayName?.trim() || undefined,
            periodName: derived.periodNames[0],
            periodNames: derived.periodNames,
            plc: plcLinkage,
            ...(effectiveDueAt != null
              ? { dueAt: effectiveDueAt, dueAtHasTime: true }
              : {}),
            ...(stepperPlan.dueAtByRosterId
              ? { dueAtByRosterId: stepperPlan.dueAtByRosterId }
              : {}),
            ...(content.resolvedDriveFileId
              ? { resolvedDriveFileId: content.resolvedDriveFileId }
              : {}),
          },
          {
            // A per-period session is gated by its periods, not a global pause.
            initialStatus: stepperPlan.periodGate ? 'active' : 'paused',
            ...(stepperPlan.periodGate ?? {}),
            ...(content.bankSlots ? { bankSlots: content.bankSlots } : {}),
            classIds: derived.classIds,
            rosterIds: derived.rosterIds,
            classPeriodByClassId: derived.classPeriodByClassId,
            ...(stepperPlan.dueAtByRosterId
              ? {
                  dueAtByClassId: dueAtByClassIdFromRosters(
                    stepperPlan.dueAtByRosterId,
                    rosters
                  ),
                }
              : {}),
            ...(stepperTargeting
              ? {
                  targetGroupIds: stepperTargeting.targetGroupIds,
                  overridesBySourcedId: stepperTargeting.overridesByKey,
                  openAt: stepperTargeting.openAt ?? null,
                  closeAt: stepperTargeting.closeAt ?? null,
                }
              : {}),
            mode: assignmentMode,
            ...(plcTemplateSyncGroupId ? { plcTemplateSyncGroupId } : {}),
            ...(plcPoolSyncGroupId ? { plcPoolSyncGroupId } : {}),
          }
        );

        saveLastAssignSettings({
          sessionMode: behavior.sessionMode,
          sessionOptions,
          attemptLimit: behavior.attemptLimit,
        });

        // Student picks fan out like the Quiz widget's stepper assign (D5b).
        const payload = buildMixedTargetsPayload(
          undefined,
          stepperPlan.mixed
        );
        if (payloadRequiresCall(payload)) {
          try {
            const result = await setAssignmentTargets({
              assignmentId,
              kind: 'quiz',
              sessionId: assignmentId,
              targetMode: payload.targetMode,
              add: payload.add,
              remove: payload.remove,
              overridesBySourcedId: payload.overridesBySourcedId,
              ...(payload.excludedTargets
                ? { excludedTargets: payload.excludedTargets }
                : {}),
              ...(payload.studentTargetClassIds
                ? { studentTargetClassIds: payload.studentTargetClassIds }
                : {}),
              window: payload.window,
            });
            if (result.skipped.length > 0) {
              addToast(
                skippedTargetsToastMessage(
                  result.skipped.length,
                  result.skippedExclusions?.length ?? 0
                ),
                'warning'
              );
              try {
                await setAssignmentTargetSkippedCount(
                  assignmentId,
                  result.skipped.length
                );
              } catch (persistErr) {
                logError(
                  'PlcNewQuizAssignmentModal.setAssignmentTargetSkippedCount',
                  persistErr,
                  { assignmentId }
                );
              }
            }
          } catch (targetErr) {
            logError(
              'PlcNewQuizAssignmentModal.setAssignmentTargets',
              targetErr,
              { assignmentId }
            );
            addToast(
              'Assigned to the class, but individual student targeting failed to save. Reopen Settings to retry.',
              'error'
            );
          }
        }

        // Only a period gate creates it active; otherwise it starts paused.
        const gated = !!stepperPlan.periodGate;
        const createdKey = gated ? 'StepperCreated' : 'Created';
        addToast(
          t(`plcDashboard.newAssignment.quiz.group${createdKey}`, {
            title: pickedQuiz.title,
            defaultValue: gated
              ? '"{{title}}" created and shared with this group.'
              : '"{{title}}" created (paused) and shared with this group.',
          }),
          'success'
        );
        onCreated?.({ assignmentId, quizTitle: pickedQuiz.title });
        onClose();
      } catch (err) {
        // The orphaned-group state we can leave behind here is the same one
        // PR #1595 documented for the share picker: createAssignment fails
        // AFTER we've already minted a synced group + attached linkage. The
        // local quiz keeps the linkage; the PLC's template/index stay empty.
        // No `detachSyncLinkage` API exists today; we log + observe.
        if (createdSyncGroupId && linkageAttached) {
          logError(
            'newPlcAssignment.orphanedGroup',
            err instanceof Error ? err : new Error(String(err)),
            {
              plcId: plc.id,
              quizId: pickedQuiz?.id,
              syncGroupId: createdSyncGroupId,
            }
          );
        } else {
          logError(
            'PlcNewQuizAssignmentModal.submit',
            err instanceof Error ? err : new Error(String(err)),
            { plcId: plc.id, quizId: pickedQuiz?.id }
          );
        }
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.newAssignment.quiz.groupCreateFailed', {
                defaultValue: 'Failed to create the team assignment.',
              }),
          'error'
        );
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [
      addToast,
      outward,
      assignmentMode,
      attachSyncLinkage,
      createAssignment,
      loadQuizData,
      loadBankContentsForQuiz,
      saveDriveSnapshot,
      onClose,
      onCreated,
      pickedQuiz,
      plc,
      rosters,
      t,
      user,
      plcLibrary,
      splitAssignSettings,
      stepperWhen,
      stepperClasses,
      periodAccess,
      saveLastAssignSettings,
      setAssignmentTargets,
      setAssignmentTargetSkippedCount,
    ]
  );

  // ─── Step 1: pick from personal library ──────────────────────────────────
  if (step === 'pick') {
    return (
      <PlcSharePickerModal
        title={t('plcDashboard.newAssignment.quiz.groupPickTitle', {
          defaultValue: 'New Team Quiz Assignment',
        })}
        subtitle={t('plcDashboard.newAssignment.quiz.pickSubtitle', {
          name: plc.name,
          defaultValue: 'Shared with {{name}}',
        })}
        prompt={
          isDriveConnected
            ? t('plcDashboard.newAssignment.quiz.pickPrompt', {
                defaultValue: 'It starts paused.',
              })
            : t('plcDashboard.newAssignment.quiz.pickPromptNoDrive', {
                defaultValue: 'Connect Google Drive to pick a quiz.',
              })
        }
        emptyMessage={t('plcDashboard.newAssignment.quiz.pickEmpty', {
          defaultValue: 'No quizzes yet. Make one in the Quiz widget.',
        })}
        items={pickerItems}
        onPick={handlePick}
        onClose={onClose}
      />
    );
  }

  // Callers set `stepperWhen` and `pickedQuiz` before moving to configure.
  if (!pickedQuiz || !stepperWhen) return null;

  return (
    <QuizAssignStepper
      title={pickedQuiz.title}
      rosters={rosters}
      classes={stepperClasses}
      onClassesChange={setStepperClasses}
      when={stepperWhen}
      onWhenChange={setStepperWhen}
      behavior={splitAssignSettings}
      onBehaviorChange={setEditedAssignSettings}
      periodAccess={periodAccess}
      hasManualGrading={false}
      handRaiseMode={handRaiseMode}
      submitLabel="Assign"
      onClose={onClose}
      onSubmit={() => handleSubmit(true)}
    />
  );
};
