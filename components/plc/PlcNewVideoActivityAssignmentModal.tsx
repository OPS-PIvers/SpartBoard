/**
 * PlcNewVideoActivityAssignmentModal — in-tab "+ Assign Video" wizard for
 * the PLC dashboard's Assignments → Library sub-tab.
 *
 * Mirrors the structure of `PlcNewQuizAssignmentModal` but for Video
 * Activities. Two-step flow:
 *
 *   1. Pick a Video Activity from the teacher's personal library.
 *   2. The assign stepper: classes, when, and a fixed PLC sharing step
 *      with Your Name + Auto-Generated Sheet.
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
import { QuizDriveService } from '@/utils/quizDriveService';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { logError } from '@/utils/logError';
import { getVideoActivityBehavior } from '@/utils/videoActivityBehavior';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from './PlcSharePickerModal';
import { mirrorPlcAssignmentStatus } from '@/hooks/usePlcAssignmentIndex';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import { ClassPickerMenu } from '@/components/common/library/assignStepper/ClassPickerMenu';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  whenBackwards,
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
import { useLastVideoAssignSettings } from '@/hooks/useLastVideoAssignSettings';
import { videoRuleStepDefs } from '@/components/common/library/assignStepper/videoRuleStepDefs';
import {
  DEFAULT_VIDEO_PLAYER_SETTINGS,
  videoRulesPrefill,
  videoRulesSessionFields,
  type VideoAssignRules,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';
import { tourAttr } from '@/config/tourAnchors';

interface PlcNewVideoActivityAssignmentModalProps {
  plc: Plc;
  /** Org-wide assignment mode. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
  onClose: () => void;
  onCreated?: (info: { assignmentId: string; activityTitle: string }) => void;
}

interface VaAssignOptions {
  teacherName: string;
  plcSheetUrl: string;
}

export const PlcNewVideoActivityAssignmentModal: React.FC<
  PlcNewVideoActivityAssignmentModalProps
> = ({ plc, assignmentMode = 'submissions', onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user, ensureGoogleScope, canAccessFeature } = useAuth();
  const { addToast, rosters } = useDashboard();
  const { activities, loadActivityData, attachSyncLinkage, isDriveConnected } =
    useVideoActivity(user?.uid);
  const { createAssignment } = useVideoActivityAssignments(user?.uid);

  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [pickedActivity, setPickedActivity] =
    useState<VideoActivityMetadata | null>(null);
  const [options, setOptions] = useState<VaAssignOptions>(() => ({
    teacherName: user?.displayName ?? '',
    plcSheetUrl: '',
  }));
  const [useAutoGenerated, setUseAutoGenerated] = useState(true);
  const submittingRef = useRef(false);
  // va-quiz-alignment: the rules are assign steps, prefilled from last-used else the activity (V3).
  const rulesOnAssign = canAccessFeature('va-quiz-alignment');
  const lastRules = useLastVideoAssignSettings(user?.uid, rulesOnAssign);
  const [pickedRules, setRules] = useState<VideoAssignRules | null>(null);
  const rules: VideoAssignRules | null =
    rulesOnAssign && pickedActivity
      ? (pickedRules ??
        videoRulesPrefill(
          getVideoActivityBehavior(pickedActivity),
          lastRules.lastUsed
        ))
      : null;
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

  const plcSheetUrlInvalid = isPlcSheetUrlInvalid(
    options.plcSheetUrl,
    useAutoGenerated
  );
  const whenInvalid = whenBackwards(
    when,
    rosters.filter((r) => !r.loadError && classes.classIds.includes(r.id)),
    undefined
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
      const validRosterIds = classes.classIds.filter((id) =>
        visibleRosterIds.has(id)
      );
      const selectedRosters: ClassRoster[] = rosters.filter((r) =>
        validRosterIds.includes(r.id)
      );
      const derived = deriveSessionTargetsFromRosters(selectedRosters);
      const window = applyAvailability(
        {
          ...EMPTY_ASSIGN_TARGETING_VALUE,
          availability: when.availability,
        },
        { enabled: true, rosters: selectedRosters, bellWindow: undefined }
      ).targeting;
      const resolvedDueAt = window.dueAt ?? null;

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
              : t(
                  'plcDashboard.newAssignment.video.groupSheetAutoCreateFailed',
                  {
                    defaultValue:
                      'Could not create the shared team sheet. The assignment will be created without one.',
                  }
                ),
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

      // The assignment's rules (va-quiz-alignment), else the activity's behavior and default player settings.
      const behavior = getVideoActivityBehavior(pickedActivity);
      const fromRules = rules ? videoRulesSessionFields(rules) : null;
      const resolvedSessionOptions: VideoActivitySessionOptions = {
        ...(fromRules?.sessionOptions ?? {
          ...behavior.sessionOptions,
          attemptLimit: behavior.attemptLimit,
        }),
        ...(resolvedDueAt != null
          ? { dueAt: resolvedDueAt, dueAtHasTime: true }
          : {}),
      };
      const playerSettings: VideoActivitySessionSettings =
        fromRules?.sessionSettings ?? { ...DEFAULT_VIDEO_PLAYER_SETTINGS };

      const { id: assignmentId } = await createAssignment(
        {
          id: pickedActivity.id,
          title: pickedActivity.title,
          youtubeUrl: data.youtubeUrl,
          driveFileId: pickedActivity.driveFileId,
          questions: data.questions,
        },
        {
          className: pickedActivity.title,
          sessionSettings: playerSettings,
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
        doc(db, 'users', user.uid, 'video_activity_assignments', assignmentId),
        { ...fields, status: 'active', updatedAt: Date.now() }
      );
      await batch.commit();
      void mirrorPlcAssignmentStatus(plc.id, assignmentId, 'active');
      if (rules) lastRules.save(rules);

      addToast('Assignment created.', 'success');
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
          : t('plcDashboard.newAssignment.video.groupCreateFailed', {
              defaultValue: 'Failed to create the team assignment.',
            }),
        'error'
      );
    } finally {
      submittingRef.current = false;
    }
  }, [
    classes,
    when,
    rules,
    lastRules,
    addToast,
    assignmentMode,
    attachSyncLinkage,
    createAssignment,
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
        title={t('plcDashboard.newAssignment.video.groupPickTitle', {
          defaultValue: 'New Team Video Activity Assignment',
        })}
        subtitle={t('plcDashboard.newAssignment.video.pickSubtitle', {
          name: plc.name,
          defaultValue: 'Shared with {{name}}',
        })}
        prompt={
          isDriveConnected
            ? undefined
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

  const pickedRosters = rosters.filter(
    (r) => !r.loadError && classes.classIds.includes(r.id)
  );
  const ctx = { kind: 'work' as const, inPlc: true };
  // Waits for last-used rules so an early Assign can't overwrite them with the activity's.
  if (rulesOnAssign && !lastRules.loaded) return null;
  const ruleSteps = rules
    ? videoRuleStepDefs({ value: rules, onChange: setRules })
    : [];
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
        ...ruleSteps,
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
      disabled={plcSheetUrlInvalid || whenInvalid}
      disabledReason={
        plcSheetUrlInvalid
          ? t('plcDashboard.newAssignment.sharing.sheetUrlInvalid', {
              defaultValue: "This doesn't look like a Google Sheets URL.",
            })
          : t('assignAvailability.closesBeforeOpens', 'Closes before it opens.')
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
