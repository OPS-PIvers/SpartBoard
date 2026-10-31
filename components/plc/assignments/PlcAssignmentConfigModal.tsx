/**
 * PlcAssignmentConfigModal — Stream B.
 *
 * In-PLC full assignment configuration. Opened after in-PLC authoring
 * (PlcAuthorQuizModal / PlcAuthorVideoActivityModal) or can be opened
 * standalone when a teacher wants to configure an assignment from their
 * existing library without leaving the PLC.
 *
 * Supports both quiz and video-activity flows. The caller passes a
 * discriminated-union prop so TypeScript guarantees the right ref type
 * for each kind.
 *
 * For the quiz kind, assignment settings start from the teacher's last-used
 * settings and are editable inline (D12 of QUIZ_REVIEW_SPLIT.md).
 *
 * Writes:
 *   - createAssignment (quiz: useQuizAssignments; VA: useVideoActivityAssignments)
 *   - writePlcAssignmentTemplate (quiz only via createAssignment's built-in
 *     PLC bubble-up; VA falls back to writePlcVideoActivityEntry — B5)
 *   - createSyncedQuizGroup / createSyncedVideoActivityGroup
 *
 * NO board navigation, NO setPendingAssignmentEdit hand-off.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, X } from 'lucide-react';
import { AssignmentSettingsToggleGroup } from '@/components/common/library/AssignmentSettingsToggleGroup';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { AssignmentQuizRef } from '@/hooks/useQuizAssignments';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import type { AssignmentActivityRef } from '@/hooks/useVideoActivityAssignments';
import { writePlcVideoActivityAssignmentTemplate } from '@/hooks/usePlcAssignments';
import { createSyncedQuizGroup } from '@/hooks/useSyncedQuizGroups';
import { useQuiz } from '@/hooks/useQuiz';
import { useBankSources } from '@/hooks/useBankSources';
import { resolveQuizAssignContent } from '@/utils/quizAssignBankDraw';
import { createSyncedVideoActivityGroup } from '@/hooks/useSyncedVideoActivityGroups';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { getPlcMemberEmails } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { dueInputsToEpoch, DEFAULT_DUE_TIME } from '@/utils/localDate';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { useLastQuizAssignSettings } from '@/hooks/useLastQuizAssignSettings';
import { QuizAssignSettingsInline } from '@/components/common/library/QuizAssignSettingsInline';
import {
  DEFAULT_VA_BEHAVIOR,
  formatVideoActivityBehaviorSummary,
} from '@/utils/videoActivityBehavior';
import { useLastVideoAssignSettings } from '@/hooks/useLastVideoAssignSettings';
import { InlineVideoRuleBodies } from '@/components/common/library/assignStepper/InlineAssignStepBodies';
import {
  videoRulesPrefill,
  videoRulesSessionFields,
  type VideoAssignRules,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';
import type {
  Plc,
  PlcLinkage,
  QuizAssignmentSettings,
  QuizBehaviorSettings,
  QuizData,
  VideoActivityAssignmentSettings,
  VideoActivityBehaviorSettings,
  VideoActivitySessionSettings,
  VideoActivitySessionOptions,
  BaseSessionOptions,
  ClassRoster,
} from '@/types';
import { syncedQuizContentFields } from '@/utils/syncedQuizContent';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlcAssignmentConfigModalProps = {
  plc: Plc;
  isOpen: boolean;
  onClose: () => void;
  /** Called once the quiz's synced group exists so the caller can link its library copy. */
  onQuizSyncGroupCreated?: (syncGroupId: string) => Promise<void>;
} & (
  | {
      kind: 'quiz';
      quizRef: AssignmentQuizRef;
      /** The authored quiz, so bank slots seed the synced group and resolve at assign. */
      quizData?: QuizData;
      activityRef?: never;
      /** Saved quiz behavior, copied onto the synced group. */
      quizBehavior?: QuizBehaviorSettings;
      vaBehavior?: never;
    }
  | {
      kind: 'video-activity';
      activityRef: AssignmentActivityRef;
      quizRef?: never;
      quizData?: never;
      quizBehavior?: never;
      /**
       * Task 10 (VA parity): when provided, the settings toggles are replaced
       * with a read-only behavior summary. Source from
       * `getVideoActivityBehavior(savedMeta)` in the caller
       * (PlcAuthorVideoActivityModal). When omitted, legacy form controls render.
       */
      vaBehavior?: VideoActivityBehaviorSettings;
    }
);

// ---------------------------------------------------------------------------
// Default session options
// ---------------------------------------------------------------------------

const DEFAULT_VA_SESSION_OPTIONS: VideoActivitySessionOptions = {
  tabWarningsEnabled: true,
  showResultToStudent: false,
  showCorrectAnswerToStudent: false,
  shuffleQuestions: true,
};

const DEFAULT_VA_SESSION_SETTINGS: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: false,
  allowSkipping: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PlcAssignmentConfigModal: React.FC<
  PlcAssignmentConfigModalProps
> = ({
  plc,
  kind,
  quizRef,
  quizData,
  activityRef,
  quizBehavior,
  vaBehavior,
  onQuizSyncGroupCreated,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user, getAssignmentMode, canAccessFeature } = useAuth();
  // D12: settings come from the teacher's last-used, editable inline.
  const { lastUsed: lastAssignSettings } = useLastQuizAssignSettings(
    user?.uid,
    kind === 'quiz'
  );
  const [editedAssignSettings, setEditedAssignSettings] =
    useState<QuizBehaviorSettings | null>(null);
  const splitAssignSettings = useMemo(
    () => editedAssignSettings ?? getQuizAssignPrefill(lastAssignSettings),
    [editedAssignSettings, lastAssignSettings]
  );
  // va-quiz-alignment: VA rules are edited here, prefilled from last-used else the activity (V3).
  const vaRulesOn =
    kind === 'video-activity' && canAccessFeature('va-quiz-alignment');
  const lastVaRules = useLastVideoAssignSettings(user?.uid, vaRulesOn);
  const [editedVaRules, setEditedVaRules] = useState<VideoAssignRules | null>(
    null
  );
  const vaRules: VideoAssignRules | null = vaRulesOn
    ? (editedVaRules ??
      videoRulesPrefill(
        vaBehavior ?? DEFAULT_VA_BEHAVIOR,
        lastVaRules.lastUsed,
        DEFAULT_VA_SESSION_SETTINGS
      ))
    : null;
  const { addToast, rosters } = useDashboard();
  const { createAssignment: createQuizAssignment } = useQuizAssignments(
    user?.uid
  );
  const { createAssignment: createVaAssignment } = useVideoActivityAssignments(
    user?.uid
  );
  const quizUid = kind === 'quiz' ? user?.uid : undefined;
  const { saveDriveSnapshot } = useQuiz(quizUid);
  const { loadBankContentsForQuiz } = useBankSources(quizUid);

  const assignmentMode = getAssignmentMode(
    kind === 'quiz' ? 'quiz' : 'videoActivity'
  );

  // --- Form state ---
  const [picker, setPicker] =
    useState<AssignClassPickerValue>(makeEmptyPickerValue);
  const [vaOptions, setVaOptions] = useState<BaseSessionOptions>(
    DEFAULT_VA_SESSION_OPTIONS
  );
  const [teacherName, setTeacherName] = useState(user?.displayName ?? '');
  const [dueAtInput, setDueAtInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Derived due-date ms epoch (null = no due date)
  const parsedDueAt: number | null = dueAtInput
    ? dueInputsToEpoch(dueAtInput, DEFAULT_DUE_TIME)
    : null;

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!user) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      // Derive roster targets
      const visibleRosterIds = new Set(
        rosters.filter((r) => !r.loadError).map((r) => r.id)
      );
      const validRosterIds = picker.rosterIds.filter((id) =>
        visibleRosterIds.has(id)
      );
      const selectedRosters: ClassRoster[] = rosters.filter((r) =>
        validRosterIds.includes(r.id)
      );
      const derived = deriveSessionTargetsFromRosters(selectedRosters);

      // PLC link only; results pool server-side, no sheet (D2).
      const plcLinkage: PlcLinkage = {
        id: plc.id,
        name: plc.name,
        memberEmails: getPlcMemberEmails(plc),
      };

      if (kind === 'quiz') {
        // Before the group exists, so a bank problem leaves nothing behind.
        const content = quizData
          ? await resolveQuizAssignContent(quizData, quizRef.driveFileId, {
              loadBankContentsForQuiz,
              saveDriveSnapshot,
            })
          : undefined;
        // Mint a synced group for the new quiz
        const syncGroupId = crypto.randomUUID();
        try {
          await createSyncedQuizGroup({
            groupId: syncGroupId,
            uid: user.uid,
            title: quizRef.title,
            questions: quizRef.questions,
            ...(quizData ? syncedQuizContentFields(quizData) : {}),
            plcId: plc.id,
            behavior: quizBehavior,
          });
          // Link the author's own library copy so their later edits publish to teammates.
          try {
            await onQuizSyncGroupCreated?.(syncGroupId);
          } catch (err) {
            logError('PlcAssignmentConfigModal.attachSyncLinkage', err, {
              plcId: plc.id,
              syncGroupId,
            });
          }
        } catch (err) {
          logError('PlcAssignmentConfigModal.createSyncedQuizGroup', err, {
            plcId: plc.id,
          });
          // Non-fatal — assignment proceeds without sync group
        }

        const settings: QuizAssignmentSettings = {
          sessionMode: 'student',
          sessionOptions: splitAssignSettings.sessionOptions,
          attemptLimit: splitAssignSettings.attemptLimit,
          teacherName: teacherName.trim() || undefined,
          periodName: derived.periodNames[0],
          periodNames: derived.periodNames,
          plc: plcLinkage,
          ...(parsedDueAt != null
            ? { dueAt: parsedDueAt, dueAtHasTime: true }
            : {}),
          ...(content?.resolvedDriveFileId
            ? { resolvedDriveFileId: content.resolvedDriveFileId }
            : {}),
        };

        const assignRef: AssignmentQuizRef = content
          ? {
              ...quizRef,
              driveFileId: content.driveFileId,
              questions: content.questions,
              ...(content.stimuli ? { stimuli: content.stimuli } : {}),
            }
          : quizRef;
        await createQuizAssignment(assignRef, settings, {
          initialStatus: 'paused',
          ...(content?.bankSlots ? { bankSlots: content.bankSlots } : {}),
          classIds: derived.classIds,
          rosterIds: derived.rosterIds,
          classPeriodByClassId: derived.classPeriodByClassId,
          mode: assignmentMode,
          plcTemplateSyncGroupId: syncGroupId,
        });

        addToast(
          t('plcDashboard.assignmentConfig.groupQuizCreated', {
            title: quizRef.title,
            defaultValue:
              '"{{title}}" created (paused) and shared with this group.',
          }),
          'success'
        );
      } else {
        // Video activity — mint synced group
        const syncGroupId = crypto.randomUUID();
        try {
          await createSyncedVideoActivityGroup({
            groupId: syncGroupId,
            uid: user.uid,
            title: activityRef.title,
            youtubeUrl: activityRef.youtubeUrl,
            questions: activityRef.questions,
            plcId: plc.id,
            behavior: vaBehavior,
            clip: activityRef.clip,
            notes: activityRef.notes,
          });
        } catch (err) {
          logError(
            'PlcAssignmentConfigModal.createSyncedVideoActivityGroup',
            err,
            { plcId: plc.id }
          );
        }

        // Task 10 (VA parity): when vaBehavior is provided, source settings
        // from it (behavior lives on the activity). Otherwise fall back to the
        // legacy form-driven controls (vaOptions) for backward compatibility.
        let effectiveVaSessionOptions: VideoActivitySessionOptions;
        const fromRules = vaRules ? videoRulesSessionFields(vaRules) : null;
        if (fromRules) {
          effectiveVaSessionOptions = {
            ...fromRules.sessionOptions,
            ...(parsedDueAt != null
              ? { dueAt: parsedDueAt, dueAtHasTime: true }
              : {}),
          };
        } else if (vaBehavior) {
          effectiveVaSessionOptions = {
            ...vaBehavior.sessionOptions,
            attemptLimit: vaBehavior.attemptLimit,
            ...(parsedDueAt != null
              ? { dueAt: parsedDueAt, dueAtHasTime: true }
              : {}),
          };
        } else {
          // Backward-compat guard: preserve legacy form controls for any
          // caller that opens this modal without providing vaBehavior.
          effectiveVaSessionOptions = {
            ...vaOptions,
            ...(parsedDueAt != null
              ? { dueAt: parsedDueAt, dueAtHasTime: true }
              : {}),
          };
        }

        const vaSettings: VideoActivityAssignmentSettings = {
          sessionSettings:
            fromRules?.sessionSettings ?? DEFAULT_VA_SESSION_SETTINGS,
          sessionOptions: effectiveVaSessionOptions,
          teacherName: teacherName.trim() || undefined,
          periodNames: derived.periodNames,
          periodName: derived.periodNames[0],
          plc: plcLinkage,
        };

        await createVaAssignment(
          activityRef,
          vaSettings,
          'paused',
          derived.classIds,
          derived.periodNames,
          derived.rosterIds,
          assignmentMode
        );
        if (vaRules) lastVaRules.save(vaRules);

        // B5: VA template write via the tested
        // writePlcVideoActivityAssignmentTemplate helper. It writes to the
        // existing video_activities subcollection (no dedicated VA-template
        // collection/rule on this branch) and is non-fatal — it logs +
        // dispatches notifyPlcWriteFailure internally so the UI can toast,
        // matching the quiz path's failure posture. No surrounding try/catch
        // needed because it never rejects.
        await writePlcVideoActivityAssignmentTemplate(plc.id, user.uid, {
          plcVideoActivityId: crypto.randomUUID(),
          title: activityRef.title,
          youtubeUrl: activityRef.youtubeUrl,
          questionCount: activityRef.questions.length,
          syncGroupId,
          sharedByEmail: user.email ?? '',
          sharedByName: user.displayName ?? '',
        });

        addToast(
          t('plcDashboard.assignmentConfig.groupVideoCreated', {
            title: activityRef.title,
            defaultValue:
              '"{{title}}" created (paused) and shared with this group.',
          }),
          'success'
        );
      }

      onClose();
    } catch (err) {
      logError(
        'PlcAssignmentConfigModal.submit',
        err instanceof Error ? err : new Error(String(err)),
        { plcId: plc.id, kind }
      );
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.assignmentConfig.groupCreateFailed', {
              defaultValue: 'Failed to create the team assignment.',
            }),
        'error'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    user,
    onQuizSyncGroupCreated,
    rosters,
    picker,
    plc,
    kind,
    quizRef,
    quizData,
    activityRef,
    quizBehavior,
    vaBehavior,
    vaRules,
    lastVaRules,
    splitAssignSettings,
    vaOptions,
    teacherName,
    parsedDueAt,
    assignmentMode,
    createQuizAssignment,
    createVaAssignment,
    loadBankContentsForQuiz,
    saveDriveSnapshot,
    addToast,
    t,
    onClose,
  ]);

  if (!isOpen) return null;

  const title =
    kind === 'quiz'
      ? t('plcDashboard.assignmentConfig.quizTitle', {
          defaultValue: 'Configure Quiz Assignment',
        })
      : t('plcDashboard.assignmentConfig.videoTitle', {
          defaultValue: 'Configure Video Assignment',
        });

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            {...tourAttr('plc-assign.close')}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Teacher name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('plcDashboard.assignmentConfig.teacherNameLabel', {
                defaultValue: 'Your name',
              })}
            </label>
            <input
              {...tourAttr('plc-assign.teacher-name')}
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30"
              placeholder={t(
                'plcDashboard.assignmentConfig.teacherNamePlaceholder',
                {
                  defaultValue: 'Your name',
                }
              )}
            />
          </div>

          {/* Due date */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1">
              <Calendar className="w-4 h-4" aria-hidden="true" />
              {t('plcDashboard.assignmentConfig.dueDateLabel', {
                defaultValue: 'Due date (optional)',
              })}
            </label>
            <input
              {...tourAttr('plc-assign.due-date')}
              type="date"
              value={dueAtInput}
              onChange={(e) => setDueAtInput(e.target.value)}
              aria-label={t('plcDashboard.assignmentConfig.dueDateLabel', {
                defaultValue: 'Due date (optional)',
              })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {/* Quiz: last-used settings, editable inline */}
          {kind === 'quiz' ? (
            <QuizAssignSettingsInline
              value={splitAssignSettings}
              onChange={setEditedAssignSettings}
            />
          ) : vaRules ? (
            <InlineVideoRuleBodies
              value={vaRules}
              onChange={setEditedVaRules}
              disabled={submitting}
            />
          ) : vaBehavior ? (
            /* VA slimmed path (Task 10 parity): read-only behavior summary */
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  {t('plcDashboard.assignmentConfig.behaviorLabel', {
                    defaultValue: 'Behavior',
                  })}
                </p>
                <span className="text-xxs text-slate-400">
                  {t('plcDashboard.assignmentConfig.vaBehaviorEditHint', {
                    defaultValue: 'Edit in the activity editor',
                  })}
                </span>
              </div>
              <p
                data-testid="plc-config-va-behavior-summary"
                className="text-sm text-slate-600 leading-snug"
              >
                {formatVideoActivityBehaviorSummary(vaBehavior)}
              </p>
            </div>
          ) : (
            /* Video-activity legacy path: settings toggles */
            <AssignmentSettingsToggleGroup
              options={vaOptions}
              onOptionsChange={setVaOptions}
              attemptLimit={undefined}
              onAttemptLimitChange={undefined}
              shuffleQuestionsAvailable
              anchors={{
                focusMode: tourFieldAttr(
                  'plc-assign.option-toggle',
                  'plc',
                  'focus-mode'
                ),
                shuffleQuestions: tourFieldAttr(
                  'plc-assign.option-toggle',
                  'plc',
                  'shuffle-questions'
                ),
                shuffleAnswerOptions: tourFieldAttr(
                  'plc-assign.option-toggle',
                  'plc',
                  'shuffle-answers'
                ),
              }}
            />
          )}

          {/* Class picker */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t('plcDashboard.assignmentConfig.classPickerLabel', {
                defaultValue: 'Class periods',
              })}
            </p>
            <AssignClassPicker
              rosters={rosters}
              value={picker}
              onChange={setPicker}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            {...tourAttr('plc-assign.cancel')}
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            {...tourAttr('plc-assign.submit')}
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (vaRulesOn && !lastVaRules.loaded)}
            className="px-4 py-2 rounded-lg bg-brand-blue-primary text-white text-sm font-semibold hover:bg-brand-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? t('plcDashboard.assignmentConfig.creating', {
                  defaultValue: 'Creating…',
                })
              : t('plcDashboard.assignmentConfig.createButton', {
                  defaultValue: 'Create Assignment',
                })}
          </button>
        </div>
      </div>
    </div>
  );
};
