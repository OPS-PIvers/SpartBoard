/**
 * PlcNewVideoActivityAssignmentModal — in-tab "+ Assign Video" wizard for
 * the PLC dashboard's Assignments → Library sub-tab.
 *
 * Mirrors the structure of `PlcNewQuizAssignmentModal` but for Video
 * Activities. Two-step flow:
 *
 *   1. Pick a Video Activity from the teacher's personal library.
 *   2. Configure player behavior + assignment-policy options +
 *      scoring/penalty in `AssignModal` chrome. The PLC slot is fixed
 *      (no PLC picker) and exposes Your Name + Auto-Generated Sheet.
 *
 * On submit, mirrors `VideoActivityWidget.handleShareWithPlc` + the
 * VA-specific `createAssignment` flow:
 *
 *   a. Auto-create a PLC sheet if Drive is connected and no manual URL
 *      was provided. Best-effort; falls through on failure.
 *   b. If the source activity has no `sync.groupId`, mint one with
 *      `plcId` set so peer importers landing on the PLC template can
 *      read the canonical group. Best-effort with rollback (matches
 *      QuizWidget's promote-on-share semantics).
 *   c. `createAssignment` with `settings.plc` set. The VA hook handles
 *      the `assignment_index` entry (`kind: 'video-activity'`) so the
 *      In-progress sub-tab picks up the new row.
 *
 * Note: VA does NOT have a Phase-3 `writePlcAssignmentTemplate` writer
 * yet — only Quiz does (see `useQuizAssignments.createAssignment`).
 * For VAs we mint the synced group so a downstream "Share with PLC"
 * kebab action from the widget can attach the same group; the
 * Library-sub-tab template list is currently quiz-only and is unchanged
 * by this flow.
 */

import { tourAttr } from '@/config/tourAnchors';
import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  AssignmentMode,
  ClassRoster,
  Plc,
  PlcLinkage,
  VideoActivityMetadata,
  VideoActivitySessionOptions,
  VideoActivitySessionSettings,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import {
  callLeaveSyncedVideoActivityGroup,
  createSyncedVideoActivityGroup,
} from '@/hooks/useSyncedVideoActivityGroups';
import { getPlcMemberEmails, getPlcTeammateEmails } from '@/utils/plc';
import {
  splitDueAtToInputs,
  dueInputsToEpoch,
  DEFAULT_DUE_TIME,
} from '@/utils/localDate';
import { QuizDriveService } from '@/utils/quizDriveService';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { logError } from '@/utils/logError';
import { AssignModal } from '@/components/common/library/AssignModal';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  getVideoActivityBehavior,
  formatVideoActivityBehaviorSummary,
} from '@/utils/videoActivityBehavior';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from './PlcSharePickerModal';
import { PlcNewAssignmentSharingSlot } from './PlcNewAssignmentSharingSlot';
import { mirrorPlcAssignmentStatus } from '@/hooks/usePlcAssignmentIndex';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import { ClassPickerMenu } from '@/components/common/library/assignStepper/ClassPickerMenu';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import {
  EMPTY_ASSIGN_CLASSES_VALUE,
  formatClassesValue,
  type AssignClassesValue,
} from '@/components/common/library/assignStepper/assignClassesValue';
import { getAssignStepTitle } from '@/components/common/library/assignStepper/assignSteps';
import { ToggleRow } from '@/components/common/library/AssignmentSettingsToggleGroup';
import { applyAvailability } from '@/utils/assignAvailability';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import { formatShortDate, isPlcSheetUrlInvalid } from './newAssignmentHelpers';
import { tourAttr } from '@/config/tourAnchors';

interface PlcNewVideoActivityAssignmentModalProps {
  plc: Plc;
  /** Org-wide assignment mode. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
  onClose: () => void;
  onCreated?: (info: { assignmentId: string; activityTitle: string }) => void;
}

/**
 * Slimmed assign-options shape (VA Task 10 parity with Quiz Task 10).
 * Behavior settings (sessionOptions, attemptLimit) are now on the activity
 * itself and sourced via `getVideoActivityBehavior(pickedActivity)` at confirm
 * time. This shape only carries the targeting / PLC state that varies per-assign.
 */
interface VaAssignOptions {
  /** Class name label (free-text, e.g. "Period 2"). */
  className: string;
  picker: AssignClassPickerValue;
  teacherName: string;
  plcSheetUrl: string;
}

function buildDefaultVaOptions(defaultTeacherName?: string): VaAssignOptions {
  return {
    className: '',
    picker: makeEmptyPickerValue(),
    teacherName: defaultTeacherName ?? '',
    plcSheetUrl: '',
  };
}

// NOTE: REWIND_SECONDS, SCORE_VISIBILITY_VALUES, and the related memos were
// removed in VA Task 10 parity (assign-slim). Behavior settings are now
// read-only at assign time via getVideoActivityBehavior.

export const PlcNewVideoActivityAssignmentModal: React.FC<
  PlcNewVideoActivityAssignmentModalProps
> = ({ plc, assignmentMode = 'submissions', onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user, googleAccessToken, ensureGoogleScope, canAccessFeature } =
    useAuth();
  const groupWording = canAccessFeature('my-groups');
  const stepperOn = canAccessFeature('assign-stepper');
  const { addToast, rosters } = useDashboard();
  const { activities, loadActivityData, attachSyncLinkage, isDriveConnected } =
    useVideoActivity(user?.uid);
  const { createAssignment } = useVideoActivityAssignments(user?.uid);

  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [pickedActivity, setPickedActivity] =
    useState<VideoActivityMetadata | null>(null);
  const [options, setOptions] = useState<VaAssignOptions>(() =>
    buildDefaultVaOptions(user?.displayName ?? undefined)
  );
  const [useAutoGenerated, setUseAutoGenerated] = useState(true);
  // Due date for the configure step (epoch ms or null = no due date).
  const [dueAt, setDueAt] = useState<number | null>(null);
  const submittingRef = useRef(false);
  // Assign stepper state (docs/plans/ASSIGN_STEPPER.md, Video follows D4).
  const [classes, setClasses] = useState<AssignClassesValue>(
    EMPTY_ASSIGN_CLASSES_VALUE
  );
  const [when, setWhen] = useState<AssignWhenValue>(() =>
    defaultWhenValue({
      activity: 'video',
      bellAvailable: false,
      manualAvailable: false,
    })
  );

  const pickerItems: PlcSharePickerItem[] = useMemo(
    () =>
      activities.map((a) => ({
        id: a.id,
        title: a.title,
        metaLine: t('plcDashboard.newAssignment.video.metaLine', {
          count: a.questionCount ?? 0,
          date: formatShortDate(a.updatedAt ?? a.createdAt ?? 0),
          defaultValue: '{{count}} questions · {{date}}',
        }),
      })),
    [activities, t]
  );

  // No memos needed for the slimmed configure step (VA Task 10 parity).

  const plcSheetUrlInvalid = isPlcSheetUrlInvalid(
    options.plcSheetUrl,
    useAutoGenerated
  );

  const handlePick = useCallback(
    (activityId: string): Promise<void> => {
      const meta = activities.find((a) => a.id === activityId);
      if (!meta) {
        addToast(
          t('plcDashboard.newAssignment.video.missingFromLibrary', {
            defaultValue: 'That video activity is no longer in your library.',
          }),
          'error'
        );
        return Promise.resolve();
      }
      setPickedActivity(meta);
      setDueAt(null);
      setOptions((p) => ({
        ...p,
        // Pre-fill the assignment's free-text label with the activity
        // title so the archive isn't a sea of "Untitled" rows. The
        // teacher can edit before submit.
        className: meta.title,
      }));
      setStep('configure');
      return Promise.resolve();
    },
    [activities, addToast, t]
  );

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!pickedActivity || !user) return;
    submittingRef.current = true;

    let createdSyncGroupId: string | null = null;
    let linkageAttached = false;
    try {
      const data = await loadActivityData(pickedActivity.driveFileId);

      const visibleRosterIds = new Set(
        rosters.filter((r) => !r.loadError).map((r) => r.id)
      );
      const validRosterIds = (
        stepperOn ? classes.classIds : options.picker.rosterIds
      ).filter((id) => visibleRosterIds.has(id));
      const selectedRosters: ClassRoster[] = rosters.filter((r) =>
        validRosterIds.includes(r.id)
      );
      const derived = deriveSessionTargetsFromRosters(selectedRosters);
      // The stepper's When resolves to a window; the old dialog only had a due date.
      const window = stepperOn
        ? applyAvailability(
            {
              ...EMPTY_ASSIGN_TARGETING_VALUE,
              availability: when.availability,
            },
            { enabled: true, rosters: selectedRosters, bellWindow: undefined }
          ).targeting
        : null;
      const resolvedDueAt = window ? (window.dueAt ?? null) : dueAt;

      const trimmedManualUrl = options.plcSheetUrl.trim();
      let resolvedSheetUrl = useAutoGenerated ? '' : trimmedManualUrl;
      let sheetAutoGenerated = false;
      // Acquire the Sheets scope on demand (Path B) before auto-creating the
      // shared sheet: silent for already-granted users, a one-time consent
      // popup for never-granted (user gesture). Null token skips creation —
      // same best-effort fall-through as before.
      const sheetsToken =
        useAutoGenerated && !resolvedSheetUrl
          ? await ensureGoogleScope('spreadsheets', { interactive: true })
          : null;
      if (useAutoGenerated && !resolvedSheetUrl && sheetsToken) {
        try {
          const driveService = new QuizDriveService(sheetsToken);
          // The Drive service's sheet-creator works for either widget — it
          // doesn't actually inspect the underlying content. Reuse it so
          // the VA wizard produces the same sheet layout as the Quiz one.
          const created = await driveService.createPlcSheetAndShare({
            plcName: plc.name,
            quizTitle: pickedActivity.title,
            memberEmailsToShareWith: getPlcTeammateEmails(plc, user.uid),
          });
          resolvedSheetUrl = created.url;
          sheetAutoGenerated = true;
        } catch (err) {
          logError('PlcNewVideoActivityAssignmentModal.sheetAutoCreate', err, {
            plcId: plc.id,
            activityId: pickedActivity.id,
          });
          addToast(
            err instanceof Error && err.message
              ? err.message
              : groupWording
                ? t(
                    'plcDashboard.newAssignment.video.groupSheetAutoCreateFailed',
                    {
                      defaultValue:
                        'Could not create the shared team sheet. The assignment will be created without one.',
                    }
                  )
                : t('plcDashboard.newAssignment.video.sheetAutoCreateFailed', {
                    defaultValue:
                      'Could not create the shared PLC sheet. The assignment will be created without one.',
                  }),
            'error'
          );
        }
      }

      const plcLinkage: PlcLinkage = {
        id: plc.id,
        name: plc.name,
        sheetUrl: resolvedSheetUrl,
        memberEmails: getPlcMemberEmails(plc),
        ...(sheetAutoGenerated ? { autoGenerated: true } : {}),
      };

      // Promote-to-synced for the source activity: mirrors the Quiz
      // wizard's branch. If the source has no `sync.groupId`, mint one
      // with `plcId` set so PLC-aware tooling discovers it.
      if (!pickedActivity.sync?.groupId) {
        const newSyncGroupId = crypto.randomUUID();
        try {
          await createSyncedVideoActivityGroup({
            groupId: newSyncGroupId,
            uid: user.uid,
            title: data.title,
            youtubeUrl: data.youtubeUrl,
            questions: data.questions,
            plcId: plc.id,
            behavior: pickedActivity.behavior,
          });
          createdSyncGroupId = newSyncGroupId;
          try {
            await attachSyncLinkage(pickedActivity.id, {
              groupId: newSyncGroupId,
              lastSyncedVersion: 1,
            });
            linkageAttached = true;
          } catch (linkageErr) {
            try {
              await callLeaveSyncedVideoActivityGroup(newSyncGroupId);
            } catch (leaveErr) {
              logError(
                'PlcNewVideoActivityAssignmentModal.promoteSync.rollbackLeave',
                leaveErr,
                { plcId: plc.id, syncGroupId: newSyncGroupId }
              );
            }
            logError(
              'PlcNewVideoActivityAssignmentModal.promoteSync.attachLinkage',
              linkageErr,
              { plcId: plc.id, activityId: pickedActivity.id }
            );
            // Fall through — the assignment can still create without
            // the source being synced; only PLC-template propagation is
            // lost (and VA doesn't have a template writer today anyway).
          }
        } catch (createErr) {
          logError(
            'PlcNewVideoActivityAssignmentModal.promoteSync.create',
            createErr,
            { plcId: plc.id, activityId: pickedActivity.id }
          );
        }
      }

      // Source behavior (sessionOptions, attemptLimit) from the activity
      // itself now that it lives on the activity (VA Task 10 parity with quiz).
      const behavior = getVideoActivityBehavior(pickedActivity);
      const resolvedSessionOptions: VideoActivitySessionOptions = {
        ...behavior.sessionOptions,
        attemptLimit: behavior.attemptLimit,
        ...(resolvedDueAt != null
          ? { dueAt: resolvedDueAt, dueAtHasTime: true }
          : {}),
      };

      // Default player-behavior settings — not authored per-assignment on
      // this path (VA sessionSettings live separately from behavior).
      const defaultPlayerSettings: VideoActivitySessionSettings = {
        autoPlay: false,
        requireCorrectAnswer: true,
        allowSkipping: false,
      };

      const { id: assignmentId } = await createAssignment(
        {
          id: pickedActivity.id,
          title: pickedActivity.title,
          youtubeUrl: data.youtubeUrl,
          driveFileId: pickedActivity.driveFileId,
          questions: data.questions,
        },
        {
          className: stepperOn
            ? pickedActivity.title
            : options.className.trim() || pickedActivity.title,
          sessionSettings: defaultPlayerSettings,
          sessionOptions: resolvedSessionOptions,
          // Mirror score-visibility onto the top-level field that the
          // assignment doc persists (hook reads this, not
          // sessionOptions.scoreVisibility, when writing docs).
          ...(resolvedSessionOptions.scoreVisibility
            ? { scoreVisibility: resolvedSessionOptions.scoreVisibility }
            : {}),
          periodNames: derived.periodNames,
          periodName: derived.periodNames[0],
          teacherName: options.teacherName.trim() || undefined,
          plc: plcLinkage,
        },
        'paused',
        derived.classIds,
        derived.periodNames,
        derived.rosterIds,
        assignmentMode
      );
      if (window) {
        const fields = {
          ...(window.openAt != null ? { openAt: window.openAt } : {}),
          ...(window.closeAt != null ? { closeAt: window.closeAt } : {}),
          ...(window.dueAt != null ? { dueAt: window.dueAt } : {}),
        };
        // One batch opens it with its window, so a failed write leaves it paused.
        const batch = writeBatch(db);
        batch.update(doc(db, 'video_activity_sessions', assignmentId), {
          ...fields,
          status: 'active',
        });
        batch.update(
          doc(
            db,
            'users',
            user.uid,
            'video_activity_assignments',
            assignmentId
          ),
          { ...fields, status: 'active', updatedAt: Date.now() }
        );
        await batch.commit();
        void mirrorPlcAssignmentStatus(plc.id, assignmentId, 'active');
      }

      addToast(
        stepperOn
          ? 'Assignment created.'
          : groupWording
            ? t('plcDashboard.newAssignment.video.groupCreated', {
                title: pickedActivity.title,
                defaultValue:
                  '"{{title}}" created (paused) and shared with this group.',
              })
            : t('plcDashboard.newAssignment.video.created', {
                title: pickedActivity.title,
                defaultValue:
                  '"{{title}}" created (paused) and shared with this PLC.',
              }),
        'success'
      );
      onCreated?.({ assignmentId, activityTitle: pickedActivity.title });
      onClose();
    } catch (err) {
      if (createdSyncGroupId && linkageAttached) {
        logError(
          'newPlcAssignment.orphanedGroup',
          err instanceof Error ? err : new Error(String(err)),
          {
            plcId: plc.id,
            activityId: pickedActivity?.id,
            syncGroupId: createdSyncGroupId,
            kind: 'video-activity',
          }
        );
      } else {
        logError(
          'PlcNewVideoActivityAssignmentModal.submit',
          err instanceof Error ? err : new Error(String(err)),
          { plcId: plc.id, activityId: pickedActivity?.id }
        );
      }
      addToast(
        err instanceof Error
          ? err.message
          : groupWording
            ? t('plcDashboard.newAssignment.video.groupCreateFailed', {
                defaultValue: 'Failed to create the team assignment.',
              })
            : t('plcDashboard.newAssignment.video.createFailed', {
                defaultValue: 'Failed to create the PLC assignment.',
              }),
        'error'
      );
    } finally {
      submittingRef.current = false;
    }
  }, [
    classes,
    stepperOn,
    when,
    groupWording,
    addToast,
    assignmentMode,
    attachSyncLinkage,
    createAssignment,
    dueAt,
    ensureGoogleScope,
    loadActivityData,
    onClose,
    onCreated,
    options,
    pickedActivity,
    plc,
    rosters,
    t,
    useAutoGenerated,
    user,
  ]);

  if (step === 'pick') {
    return (
      <PlcSharePickerModal
        title={
          groupWording
            ? t('plcDashboard.newAssignment.video.groupPickTitle', {
                defaultValue: 'New Team Video Activity Assignment',
              })
            : t('plcDashboard.newAssignment.video.pickTitle', {
                defaultValue: 'New PLC Video Activity Assignment',
              })
        }
        subtitle={t('plcDashboard.newAssignment.video.pickSubtitle', {
          name: plc.name,
          defaultValue: 'Shared with {{name}}',
        })}
        prompt={
          isDriveConnected
            ? stepperOn
              ? undefined
              : t('plcDashboard.newAssignment.video.pickPrompt', {
                  defaultValue: 'It starts paused.',
                })
            : t('plcDashboard.newAssignment.video.pickPromptNoDrive', {
                defaultValue: 'Connect Google Drive to pick a video activity.',
              })
        }
        emptyMessage={t('plcDashboard.newAssignment.video.pickEmpty', {
          defaultValue:
            'No video activities yet. Make one in the Video Activity widget.',
        })}
        items={pickerItems}
        onPick={handlePick}
        onClose={onClose}
      />
    );
  }

  if (!pickedActivity) {
    return null;
  }

  // Source behavior from the picked activity for the read-only summary.
  const behavior = getVideoActivityBehavior(pickedActivity);
  const behaviorSummary = formatVideoActivityBehaviorSummary(behavior);

  const dueDateInputValue = splitDueAtToInputs(dueAt, true).date;

  if (stepperOn) {
    const pickedRosters = rosters.filter(
      (r) => !r.loadError && classes.classIds.includes(r.id)
    );
    const ctx = { kind: 'work' as const, inPlc: true };
    return (
      <AssignStepper
        isOpen
        onClose={onClose}
        title={pickedActivity.title}
        steps={[
          {
            id: 'classes',
            title: getAssignStepTitle('classes', 'video', ctx),
            value: formatClassesValue(
              classes,
              rosters.filter((r) => !r.loadError)
            ),
            body: (
              <ClassPickerMenu
                rosters={rosters.filter((r) => !r.loadError)}
                value={classes}
                onChange={setClasses}
              />
            ),
          },
          {
            id: 'when',
            title: getAssignStepTitle('when', 'video', ctx),
            value: formatWhenValue(when, {
              variant: 'when',
              rosterCount: pickedRosters.length,
              manualAvailable: false,
              t,
            }),
            body: (
              <AssignWhenStep
                value={when}
                onChange={setWhen}
                variant="when"
                rosters={pickedRosters}
              />
            ),
          },
          {
            id: 'sharing',
            title: getAssignStepTitle('sharing', 'video', ctx),
            value: `Shared with ${plc.name}`,
            body: (
              <PlcSharingStepBody
                teacherName={options.teacherName}
                onTeacherNameChange={(v) =>
                  setOptions((p) => ({ ...p, teacherName: v }))
                }
                useAutoGenerated={useAutoGenerated}
                onUseAutoGeneratedChange={(v) => {
                  setUseAutoGenerated(v);
                  if (v) setOptions((p) => ({ ...p, plcSheetUrl: '' }));
                }}
                plcSheetUrl={options.plcSheetUrl}
                onPlcSheetUrlChange={(v) =>
                  setOptions((p) => ({ ...p, plcSheetUrl: v }))
                }
                plcSheetUrlInvalid={plcSheetUrlInvalid}
              />
            ),
          },
        ]}
        submitLabel="Assign"
        onSubmit={handleSubmit}
        disabled={plcSheetUrlInvalid}
        disabledReason={t(
          'plcDashboard.newAssignment.sharing.sheetUrlInvalid',
          {
            defaultValue: "This doesn't look like a Google Sheets URL.",
          }
        )}
      />
    );
  }

  return (
    <AssignModal<VaAssignOptions>
      isOpen
      onClose={onClose}
      itemTitle={pickedActivity.title}
      options={options}
      onOptionsChange={setOptions}
      assignmentName={options.className}
      onAssignmentNameChange={(v) =>
        setOptions((p) => ({ ...p, className: v }))
      }
      confirmLabel={t('plcDashboard.newAssignment.confirm', {
        defaultValue: 'Create assignment',
      })}
      confirmDisabled={
        options.className.trim().length === 0 || plcSheetUrlInvalid
      }
      confirmDisabledReason={
        options.className.trim().length === 0
          ? t('plcDashboard.newAssignment.video.nameRequired', {
              defaultValue: 'Enter an assignment name.',
            })
          : t('plcDashboard.newAssignment.sharing.sheetUrlInvalid', {
              defaultValue: "This doesn't look like a Google Sheets URL.",
            })
      }
      onAssign={async () => {
        await handleSubmit();
      }}
      extraSlot={
        <>
          {/* Class picker */}
          <AssignClassPicker
            rosters={rosters}
            value={options.picker}
            onChange={(picker) => setOptions((p) => ({ ...p, picker }))}
          />

          {/* Due date */}
          <div>
            <label
              htmlFor="plc-va-assign-due-date"
              className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1"
            >
              {t('plcDashboard.newAssignment.video.dueDateLabel', {
                defaultValue: 'Due Date',
              })}{' '}
              <span className="font-normal">
                {t('common.optional', { defaultValue: '(optional)' })}
              </span>
            </label>
            <input
              {...tourAttr('video-activity.plc-assign-due-date')}
              id="plc-va-assign-due-date"
              type="date"
              data-testid="plc-va-assign-due-date"
              {...tourAttr('plc-video-assign.due-date')}
              value={dueDateInputValue}
              onChange={(e) => {
                const val = e.target.value;
                setDueAt(val ? dueInputsToEpoch(val, DEFAULT_DUE_TIME) : null);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />
          </div>

          {/* Read-only behavior summary */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                {t('plcDashboard.newAssignment.video.behaviorLabel', {
                  defaultValue: 'Behavior',
                })}
              </p>
              <span className="text-xxs text-slate-400">
                {t('plcDashboard.newAssignment.video.behaviorEditHint', {
                  defaultValue: 'Edit in the activity editor',
                })}
              </span>
            </div>
            <p
              data-testid="plc-new-va-behavior-summary"
              className="text-sm text-slate-600 leading-snug"
            >
              {behaviorSummary}
            </p>
          </div>
        </>
      }
      plcSlot={
        <PlcNewAssignmentSharingSlot
          plcName={plc.name}
          teacherName={options.teacherName}
          onTeacherNameChange={(v) =>
            setOptions((p) => ({ ...p, teacherName: v }))
          }
          sheet={{
            useAutoGenerated,
            onUseAutoGeneratedChange: (v) => {
              setUseAutoGenerated(v);
              if (v) setOptions((p) => ({ ...p, plcSheetUrl: '' }));
            },
            plcSheetUrl: options.plcSheetUrl,
            onPlcSheetUrlChange: (v) =>
              setOptions((p) => ({ ...p, plcSheetUrl: v })),
            plcSheetUrlInvalid,
            googleAccessToken,
          }}
        />
      }
    />
  );
};

/** The stepper's Sharing step for a fixed PLC: your name and the results sheet. */
const PlcSharingStepBody: React.FC<{
  teacherName: string;
  onTeacherNameChange: (next: string) => void;
  useAutoGenerated: boolean;
  onUseAutoGeneratedChange: (next: boolean) => void;
  plcSheetUrl: string;
  onPlcSheetUrlChange: (next: string) => void;
  plcSheetUrlInvalid: boolean;
}> = ({
  teacherName,
  onTeacherNameChange,
  useAutoGenerated,
  onUseAutoGeneratedChange,
  plcSheetUrl,
  onPlcSheetUrlChange,
  plcSheetUrlInvalid,
}) => {
  const { t } = useTranslation();
  const nameId = useId();
  const urlId = useId();
  const inputClass =
    'h-8 w-full px-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={nameId}
          className="shrink-0 text-sm font-bold text-brand-blue-dark"
        >
          {t('plcDashboard.newAssignment.sharing.teacherNameLabel', {
            defaultValue: 'Your Name',
          })}
        </label>
        <input
          {...tourAttr('video-activity.plc-teacher-name')}
          id={nameId}
          type="text"
          value={teacherName}
          onChange={(e) => onTeacherNameChange(e.target.value)}
          {...tourAttr('plc-video-assign.teacher-name')}
          placeholder={t(
            'plcDashboard.newAssignment.sharing.teacherNamePlaceholder',
            { defaultValue: 'e.g. Ms. Smith' }
          )}
          className={`${inputClass} max-w-56`}
        />
      </div>
      <ToggleRow
        label={t('plcDashboard.newAssignment.sharing.autoSheetLabel', {
          defaultValue: 'Auto-Generated PLC Sheet',
        })}
        checked={useAutoGenerated}
        anchor={tourAttr('video-activity.plc-auto-sheet')}
        onChange={onUseAutoGeneratedChange}
      />
      {!useAutoGenerated && (
        <div className="space-y-1">
          <label htmlFor={urlId} className="sr-only">
            {t('plcDashboard.newAssignment.sharing.sheetUrlLabel', {
              defaultValue: 'Shared Google Sheet URL',
            })}
          </label>
          <input
            {...tourAttr('video-activity.plc-sheet-url')}
            id={urlId}
            type="text"
            value={plcSheetUrl}
            onChange={(e) => onPlcSheetUrlChange(e.target.value)}
            {...tourAttr('plc-video-assign.sheet-url')}
            placeholder={t(
              'plcDashboard.newAssignment.sharing.sheetUrlPlaceholder',
              { defaultValue: 'https://docs.google.com/spreadsheets/d/...' }
            )}
            className={inputClass}
          />
          {plcSheetUrlInvalid && (
            <p className="text-xs text-amber-700">
              {t('plcDashboard.newAssignment.sharing.sheetUrlInvalid', {
                defaultValue: "This doesn't look like a Google Sheets URL.",
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
