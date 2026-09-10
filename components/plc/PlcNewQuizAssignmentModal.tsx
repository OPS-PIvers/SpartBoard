/**
 * PlcNewQuizAssignmentModal — in-tab "+ Assign Quiz" wizard for the PLC
 * dashboard's Assignments → Library sub-tab.
 *
 * Two-step flow:
 *
 *   1. Pick a quiz from the teacher's personal library
 *      (reuses `PlcSharePickerModal`).
 *   2. Slimmed configure step: class/period picker + due-date + read-only
 *      behavior summary from `getQuizBehavior(pickedQuiz)` + teacher name.
 *
 * On submit:
 *
 *   a. Build the `PlcLinkage` (`id`, `name`, `memberEmails`). No Google Sheet
 *      step — pooled results come from the server-side PLC pipeline
 *      (docs/plans/PLC_ASSESSMENT_DATA.md); a sheet can be added from Results.
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
import { Calendar, X } from 'lucide-react';
import type {
  AssignmentMode,
  ClassRoster,
  Plc,
  PlcLinkage,
  QuizMetadata,
  QuizSessionOptions,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import {
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
} from '@/hooks/useSyncedQuizGroups';
import { getPlcMemberEmails } from '@/utils/plc';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';
import { resolvePlcPoolSyncGroupId } from '@/utils/plcPooling';
import {
  splitDueAtToInputs,
  dueInputsToEpoch,
  DEFAULT_DUE_TIME,
} from '@/utils/localDate';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { logError } from '@/utils/logError';
import { getQuizBehavior, formatBehaviorSummary } from '@/utils/quizBehavior';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from './PlcSharePickerModal';
import { PlcNewAssignmentSharingSlot } from './PlcNewAssignmentSharingSlot';
import { formatShortDate } from './newAssignmentHelpers';

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

/** Slimmed configure-step options (Task 10). Behavior is on the quiz. */
interface QuizAssignOptions {
  teacherName: string;
  picker: AssignClassPickerValue;
}

function buildDefaultOptions(defaultTeacherName?: string): QuizAssignOptions {
  return {
    teacherName: defaultTeacherName ?? '',
    picker: makeEmptyPickerValue(),
  };
}

export const PlcNewQuizAssignmentModal: React.FC<
  PlcNewQuizAssignmentModalProps
> = ({ plc, assignmentMode = 'submissions', onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast, rosters } = useDashboard();
  const { quizzes, loadQuizData, attachSyncLinkage, isDriveConnected } =
    useQuiz(user?.uid);
  const { createAssignment } = useQuizAssignments(user?.uid);
  // PLC library, used to pool this run with an existing group of the same title.
  const { quizzes: plcLibrary } = usePlcQuizzes(plc.id);

  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [pickedQuiz, setPickedQuiz] = useState<QuizMetadata | null>(null);
  const [options, setOptions] = useState<QuizAssignOptions>(() =>
    buildDefaultOptions(user?.displayName ?? undefined)
  );
  // Due date state (epoch ms or null)
  const [dueAt, setDueAt] = useState<number | null>(null);
  // Synchronous submit guard. State alone isn't enough — a double-click
  // can fire two submit handlers before React commits the first
  // setState. See `PlcSharePickerModal.handlePick` for the same pattern.
  const submittingRef = useRef(false);
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
      setPickedQuiz(meta);
      setStep('configure');
      return Promise.resolve();
    },
    [addToast, quizzes, t]
  );

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!pickedQuiz || !user) return;
    submittingRef.current = true;
    setSubmitting(true);

    let createdSyncGroupId: string | null = null;
    let linkageAttached = false;
    try {
      // Load Drive content up front so a sync-group mint never lands
      // without questions, and so any Drive auth issue surfaces a toast
      // before we touch shared state.
      const data = await loadQuizData(pickedQuiz.driveFileId);

      const visibleRosterIds = new Set(
        rosters.filter((r) => !r.loadError).map((r) => r.id)
      );
      const validRosterIds = options.picker.rosterIds.filter((id) =>
        visibleRosterIds.has(id)
      );
      const selectedRosters: ClassRoster[] = rosters.filter((r) =>
        validRosterIds.includes(r.id)
      );
      const derived = deriveSessionTargetsFromRosters(selectedRosters);

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
      let plcTemplateSyncGroupId: string | undefined = pickedQuiz.sync?.groupId;
      if (!plcTemplateSyncGroupId) {
        const newSyncGroupId = crypto.randomUUID();
        try {
          await createSyncedQuizGroup({
            groupId: newSyncGroupId,
            uid: user.uid,
            title: data.title,
            questions: data.questions,
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
          logError('PlcNewQuizAssignmentModal.promoteSync.create', createErr, {
            plcId: plc.id,
            quizId: pickedQuiz.id,
          });
          plcTemplateSyncGroupId = undefined;
        }
      }

      // Task 10: source sessionMode/sessionOptions/attemptLimit from the
      // quiz's behavior settings (getQuizBehavior). No longer driven by
      // removed form controls.
      const behavior = getQuizBehavior(pickedQuiz);
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
          driveFileId: pickedQuiz.driveFileId,
          questions: data.questions,
          ...(data.stimuli ? { stimuli: data.stimuli } : {}),
          ...(data.language ? { language: data.language } : {}),
        },
        {
          sessionMode: behavior.sessionMode,
          sessionOptions,
          attemptLimit: behavior.attemptLimit,
          teacherName: options.teacherName.trim() || undefined,
          periodName: derived.periodNames[0],
          periodNames: derived.periodNames,
          plc: plcLinkage,
          ...(dueAt != null ? { dueAt, dueAtHasTime: true } : {}),
        },
        {
          initialStatus: 'paused',
          classIds: derived.classIds,
          rosterIds: derived.rosterIds,
          classPeriodByClassId: derived.classPeriodByClassId,
          mode: assignmentMode,
          ...(plcTemplateSyncGroupId ? { plcTemplateSyncGroupId } : {}),
          ...(plcPoolSyncGroupId ? { plcPoolSyncGroupId } : {}),
        }
      );

      addToast(
        t('plcDashboard.newAssignment.quiz.created', {
          title: pickedQuiz.title,
          defaultValue:
            '"{{title}}" created (paused) and shared with this PLC.',
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
          : t('plcDashboard.newAssignment.quiz.createFailed', {
              defaultValue: 'Failed to create the PLC assignment.',
            }),
        'error'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    addToast,
    assignmentMode,
    attachSyncLinkage,
    createAssignment,
    dueAt,
    loadQuizData,
    onClose,
    onCreated,
    options,
    pickedQuiz,
    plc,
    rosters,
    t,
    user,
    plcLibrary,
  ]);

  // ─── Step 1: pick from personal library ──────────────────────────────────
  if (step === 'pick') {
    return (
      <PlcSharePickerModal
        title={t('plcDashboard.newAssignment.quiz.pickTitle', {
          defaultValue: 'New PLC Quiz Assignment',
        })}
        subtitle={t('plcDashboard.newAssignment.quiz.pickSubtitle', {
          name: plc.name,
          defaultValue: 'Shared with {{name}}',
        })}
        prompt={
          isDriveConnected
            ? t('plcDashboard.newAssignment.quiz.pickPrompt', {
                defaultValue:
                  'Pick a quiz from your personal library. The assignment will be created paused so you can review it before going live.',
              })
            : t('plcDashboard.newAssignment.quiz.pickPromptNoDrive', {
                defaultValue:
                  'Connect Google Drive in your account to assign quizzes from your personal library.',
              })
        }
        emptyMessage={t('plcDashboard.newAssignment.quiz.pickEmpty', {
          defaultValue:
            "You don't have any quizzes in your personal library yet. Create one in the Quiz widget first.",
        })}
        items={pickerItems}
        onPick={handlePick}
        onClose={onClose}
      />
    );
  }

  // ─── Step 2: slimmed configure — class picker + due-date + behavior summary
  if (!pickedQuiz) {
    // Defensive: callers transition `step` only after `pickedQuiz` is set,
    // so this branch is unreachable in practice. Bail rather than render
    // a broken modal if state ever desynchronizes.
    return null;
  }

  const behavior = getQuizBehavior(pickedQuiz);
  const behaviorSummary = formatBehaviorSummary(behavior);

  const visibleRosterIds = new Set(
    rosters.filter((r) => !r.loadError).map((r) => r.id)
  );
  const effectivePeriodCount = options.picker.rosterIds.filter((id) =>
    visibleRosterIds.has(id)
  ).length;

  const dateInputValue = splitDueAtToInputs(dueAt, true).date;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDueAt(val ? dueInputsToEpoch(val, DEFAULT_DUE_TIME) : null);
  };

  const modalTitle = t('plcDashboard.newAssignment.quiz.configureTitle', {
    title: pickedQuiz.title,
    defaultValue: 'Assign "{{title}}"',
  });

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {modalTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('plcDashboard.newAssignment.quiz.configureSubtitle', {
                name: plc.name,
                defaultValue: 'Shared with {{name}}',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Class / period picker */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t('plcDashboard.newAssignment.quiz.classPickerLabel', {
                defaultValue: 'Target class periods (optional)',
              })}
            </p>
            <AssignClassPicker
              rosters={rosters}
              value={options.picker}
              onChange={(picker) => setOptions((p) => ({ ...p, picker }))}
            />
          </div>

          {/* Due date */}
          <div>
            <label
              htmlFor="plc-assign-due-date-input"
              className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4" aria-hidden="true" />
              {t('plcDashboard.newAssignment.quiz.dueDateLabel', {
                defaultValue: 'Due date (optional)',
              })}
            </label>
            <input
              id="plc-assign-due-date-input"
              type="date"
              data-testid="plc-assign-due-date"
              value={dateInputValue}
              onChange={handleDateChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {/* Read-only behavior summary */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                {t('plcDashboard.newAssignment.quiz.behaviorLabel', {
                  defaultValue: 'Behavior',
                })}
              </p>
              <span className="text-xxs text-slate-400">
                {t('plcDashboard.newAssignment.quiz.behaviorEditHint', {
                  defaultValue: 'Edit in the quiz editor',
                })}
              </span>
            </div>
            <p
              data-testid="plc-quiz-behavior-summary"
              className="text-sm text-slate-600 leading-snug"
            >
              {behaviorSummary}
            </p>
          </div>

          {/* PLC sharing slot (teacher name only — no sheet step) */}
          <PlcNewAssignmentSharingSlot
            plcName={plc.name}
            effectivePeriodCount={effectivePeriodCount}
            teacherName={options.teacherName}
            onTeacherNameChange={(v) =>
              setOptions((p) => ({ ...p, teacherName: v }))
            }
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-brand-blue-primary text-white text-sm font-semibold hover:bg-brand-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? t('plcDashboard.assignmentConfig.creating', {
                  defaultValue: 'Creating…',
                })
              : t('plcDashboard.newAssignment.confirm', {
                  defaultValue: 'Create assignment',
                })}
          </button>
        </div>
      </div>
    </div>
  );
};
