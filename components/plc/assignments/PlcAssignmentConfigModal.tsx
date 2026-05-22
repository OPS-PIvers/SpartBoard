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
 * For the quiz kind, behavior settings (mode, toggles, gamification,
 * attemptLimit) are sourced from the optional `quizBehavior` prop (Task 10).
 * When provided, the mode picker and settings toggles are replaced with a
 * read-only behavior summary. When not provided (backward compat), the legacy
 * mode picker + toggles are rendered.
 *
 * Writes:
 *   - createAssignment (quiz: useQuizAssignments; VA: useVideoActivityAssignments)
 *   - writePlcAssignmentTemplate (quiz only via createAssignment's built-in
 *     PLC bubble-up; VA falls back to writePlcVideoActivityEntry — B5)
 *   - createSyncedQuizGroup / createSyncedVideoActivityGroup
 *   - QuizDriveService.createPlcSheetAndShare (best-effort)
 *
 * NO board navigation, NO setPendingAssignmentEdit hand-off.
 */

import React, { useCallback, useRef, useState } from 'react';
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
import { createSyncedVideoActivityGroup } from '@/hooks/useSyncedVideoActivityGroups';
import { QuizDriveService } from '@/utils/quizDriveService';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { getPlcMemberEmails, getPlcTeammateEmails } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { formatBehaviorSummary } from '@/utils/quizBehavior';
import type {
  Plc,
  PlcLinkage,
  QuizAssignmentSettings,
  QuizBehaviorSettings,
  QuizSessionMode,
  QuizSessionOptions,
  VideoActivityAssignmentSettings,
  VideoActivitySessionSettings,
  VideoActivitySessionOptions,
  BaseSessionOptions,
  ClassRoster,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlcAssignmentConfigModalProps = {
  plc: Plc;
  isOpen: boolean;
  onClose: () => void;
} & (
  | {
      kind: 'quiz';
      quizRef: AssignmentQuizRef;
      activityRef?: never;
      /**
       * Task 10: when provided, the mode picker + settings toggles are
       * replaced with a read-only behavior summary. Source from
       * `getQuizBehavior(savedMeta)` in the caller (PlcAuthorQuizModal).
       * When omitted, the legacy mode picker + toggles render as before.
       */
      quizBehavior?: QuizBehaviorSettings;
    }
  | {
      kind: 'video-activity';
      activityRef: AssignmentActivityRef;
      quizRef?: never;
      quizBehavior?: never;
    }
);

// ---------------------------------------------------------------------------
// Default session options
// ---------------------------------------------------------------------------

const DEFAULT_QUIZ_SESSION_OPTIONS: QuizSessionOptions = {
  tabWarningsEnabled: true,
  showResultToStudent: false,
  showCorrectAnswerToStudent: false,
  showCorrectOnBoard: false,
  speedBonusEnabled: false,
  streakBonusEnabled: false,
  showPodiumBetweenQuestions: false,
  soundEffectsEnabled: false,
  shuffleQuestions: false,
  shuffleAnswerOptions: true,
};

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

const DEFAULT_QUIZ_MODES: { id: QuizSessionMode; label: string }[] = [
  { id: 'teacher', label: 'Teacher-paced' },
  { id: 'auto', label: 'Auto-paced' },
  { id: 'student', label: 'Self-paced' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PlcAssignmentConfigModal: React.FC<
  PlcAssignmentConfigModalProps
> = ({ plc, kind, quizRef, activityRef, quizBehavior, isOpen, onClose }) => {
  const { t } = useTranslation();
  const { user, googleAccessToken, getAssignmentMode } = useAuth();
  const { addToast, rosters } = useDashboard();
  const { createAssignment: createQuizAssignment } = useQuizAssignments(
    user?.uid
  );
  const { createAssignment: createVaAssignment } = useVideoActivityAssignments(
    user?.uid
  );

  const assignmentMode = getAssignmentMode(
    kind === 'quiz' ? 'quiz' : 'videoActivity'
  );

  // --- Form state ---
  const [quizMode, setQuizMode] = useState<QuizSessionMode>('auto');
  const [picker, setPicker] =
    useState<AssignClassPickerValue>(makeEmptyPickerValue);
  const [quizOptions, setQuizOptions] = useState<BaseSessionOptions>(
    DEFAULT_QUIZ_SESSION_OPTIONS
  );
  const [vaOptions, setVaOptions] = useState<BaseSessionOptions>(
    DEFAULT_VA_SESSION_OPTIONS
  );
  const [attemptLimit, setAttemptLimit] = useState<number | null>(1);
  const [teacherName, setTeacherName] = useState(user?.displayName ?? '');
  const [dueAtInput, setDueAtInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Derived due-date ms epoch (null = no due date)
  const parsedDueAt: number | null = dueAtInput
    ? new Date(dueAtInput).getTime() || null
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

      // Build PLC sheet (best-effort)
      let resolvedSheetUrl = '';
      let sheetAutoGenerated = false;
      if (googleAccessToken) {
        try {
          const driveService = new QuizDriveService(googleAccessToken);
          const created = await driveService.createPlcSheetAndShare({
            plcName: plc.name,
            quizTitle: kind === 'quiz' ? quizRef.title : activityRef.title,
            memberEmailsToShareWith: getPlcTeammateEmails(plc, user.uid),
          });
          resolvedSheetUrl = created.url;
          sheetAutoGenerated = true;
        } catch (err) {
          logError('PlcAssignmentConfigModal.sheetAutoCreate', err, {
            plcId: plc.id,
          });
          // Non-fatal — assignment proceeds without sheet
        }
      }

      const plcLinkage: PlcLinkage = {
        id: plc.id,
        name: plc.name,
        sheetUrl: resolvedSheetUrl,
        memberEmails: getPlcMemberEmails(plc),
        ...(sheetAutoGenerated ? { autoGenerated: true } : {}),
      };

      if (kind === 'quiz') {
        // Mint a synced group for the new quiz
        const syncGroupId = crypto.randomUUID();
        try {
          await createSyncedQuizGroup({
            groupId: syncGroupId,
            uid: user.uid,
            title: quizRef.title,
            questions: quizRef.questions,
            plcId: plc.id,
          });
        } catch (err) {
          logError('PlcAssignmentConfigModal.createSyncedQuizGroup', err, {
            plcId: plc.id,
          });
          // Non-fatal — assignment proceeds without sync group
        }

        // Task 10: when quizBehavior is provided, source settings from it
        // (behavior lives on the quiz). Otherwise fall back to the legacy
        // form-driven controls (quizMode / quizOptions / attemptLimit).
        let effectiveSessionMode: QuizSessionMode;
        let effectiveSessionOptions: QuizSessionOptions;
        let effectiveAttemptLimit: number | null;
        if (quizBehavior) {
          effectiveSessionMode = quizBehavior.sessionMode;
          effectiveSessionOptions = quizBehavior.sessionOptions;
          effectiveAttemptLimit = quizBehavior.attemptLimit;
        } else {
          // Backward-compat guard: today the only live quiz caller
          // (PlcAuthorQuizModal) always supplies quizBehavior, but this
          // branch preserves correct behavior for any future caller that
          // opens this modal for a quiz without providing quizBehavior.
          effectiveSessionMode = quizMode;
          effectiveSessionOptions = { ...quizOptions } as QuizSessionOptions;
          effectiveAttemptLimit = attemptLimit;
        }

        const settings: QuizAssignmentSettings = {
          sessionMode: effectiveSessionMode,
          sessionOptions: effectiveSessionOptions,
          attemptLimit: effectiveAttemptLimit,
          teacherName: teacherName.trim() || undefined,
          periodName: derived.periodNames[0],
          periodNames: derived.periodNames,
          plc: plcLinkage,
          ...(parsedDueAt != null ? { dueAt: parsedDueAt } : {}),
        };

        await createQuizAssignment(quizRef, settings, {
          initialStatus: 'paused',
          classIds: derived.classIds,
          rosterIds: derived.rosterIds,
          classPeriodByClassId: derived.classPeriodByClassId,
          mode: assignmentMode,
          plcTemplateSyncGroupId: syncGroupId,
        });

        addToast(
          t('plcDashboard.assignmentConfig.quizCreated', {
            title: quizRef.title,
            defaultValue:
              '"{{title}}" created (paused) and shared with this PLC.',
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
          });
        } catch (err) {
          logError(
            'PlcAssignmentConfigModal.createSyncedVideoActivityGroup',
            err,
            { plcId: plc.id }
          );
        }

        const vaSettings: VideoActivityAssignmentSettings = {
          sessionSettings: DEFAULT_VA_SESSION_SETTINGS,
          sessionOptions: {
            ...vaOptions,
            ...(parsedDueAt != null ? { dueAt: parsedDueAt } : {}),
          } as VideoActivitySessionOptions,
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
          t('plcDashboard.assignmentConfig.videoCreated', {
            title: activityRef.title,
            defaultValue:
              '"{{title}}" created (paused) and shared with this PLC.',
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
          : t('plcDashboard.assignmentConfig.createFailed', {
              defaultValue: 'Failed to create the PLC assignment.',
            }),
        'error'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    user,
    rosters,
    picker,
    googleAccessToken,
    plc,
    kind,
    quizRef,
    activityRef,
    quizBehavior,
    quizMode,
    quizOptions,
    vaOptions,
    attemptLimit,
    teacherName,
    parsedDueAt,
    assignmentMode,
    createQuizAssignment,
    createVaAssignment,
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Teacher name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('plcDashboard.assignmentConfig.teacherNameLabel', {
                defaultValue: 'Your display name (for the PLC sheet)',
              })}
            </label>
            <input
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
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
              type="date"
              value={dueAtInput}
              onChange={(e) => setDueAtInput(e.target.value)}
              aria-label={t('plcDashboard.assignmentConfig.dueDateLabel', {
                defaultValue: 'Due date (optional)',
              })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {/* Quiz-specific: behavior summary (Task 10) or legacy mode selector */}
          {kind === 'quiz' && quizBehavior ? (
            /* Slimmed path: read-only behavior summary from quiz settings */
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  {t('plcDashboard.assignmentConfig.behaviorLabel', {
                    defaultValue: 'Behavior',
                  })}
                </p>
                <span className="text-xxs text-slate-400">
                  {t('plcDashboard.assignmentConfig.behaviorEditHint', {
                    defaultValue: 'Edit in the quiz editor',
                  })}
                </span>
              </div>
              <p
                data-testid="plc-config-behavior-summary"
                className="text-sm text-slate-600 leading-snug"
              >
                {formatBehaviorSummary(quizBehavior)}
              </p>
            </div>
          ) : kind === 'quiz' ? (
            /* Legacy path: mode selector + settings toggles */
            <>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  {t('plcDashboard.assignmentConfig.modeLabel', {
                    defaultValue: 'Session mode',
                  })}
                </p>
                <div
                  role="radiogroup"
                  aria-label={t('plcDashboard.assignmentConfig.modeLabel', {
                    defaultValue: 'Session mode',
                  })}
                  className="flex gap-2 flex-wrap"
                >
                  {DEFAULT_QUIZ_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={quizMode === m.id}
                      onClick={() => setQuizMode(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        quizMode === m.id
                          ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-brand-blue-primary/50'
                      }`}
                    >
                      {t(`plcDashboard.assignmentConfig.mode.${m.id}`, {
                        defaultValue: m.label,
                      })}
                    </button>
                  ))}
                </div>
              </div>
              <AssignmentSettingsToggleGroup
                options={quizOptions}
                onOptionsChange={setQuizOptions}
                attemptLimit={attemptLimit}
                onAttemptLimitChange={setAttemptLimit}
                shuffleQuestionsAvailable={false}
              />
            </>
          ) : (
            /* Video-activity: settings toggles (unchanged) */
            <AssignmentSettingsToggleGroup
              options={vaOptions}
              onOptionsChange={setVaOptions}
              attemptLimit={undefined}
              onAttemptLimitChange={undefined}
              shuffleQuestionsAvailable
            />
          )}

          {/* Class picker */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {t('plcDashboard.assignmentConfig.classPickerLabel', {
                defaultValue: 'Target class periods (optional)',
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
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
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
