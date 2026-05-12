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

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Share2 } from 'lucide-react';
import type {
  AssignmentMode,
  ClassRoster,
  Plc,
  PlcLinkage,
  VideoActivityMetadata,
  VideoActivityScoreVisibility,
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
import { AssignModal } from '@/components/common/library/AssignModal';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  AssignmentSettingsToggleGroup,
  SectionHeader,
  ToggleRow,
} from '@/components/common/library/AssignmentSettingsToggleGroup';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from './PlcSharePickerModal';

interface PlcNewVideoActivityAssignmentModalProps {
  plc: Plc;
  /** Org-wide assignment mode. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
  onClose: () => void;
  onCreated?: (info: { assignmentId: string; activityTitle: string }) => void;
}

interface VaAssignOptions {
  /** Class name label (free-text, e.g. "Period 2"). */
  className: string;
  /** Player behavior. */
  sessionSettings: VideoActivitySessionSettings;
  /** Policy + scoring. */
  sessionOptions: VideoActivitySessionOptions;
  picker: AssignClassPickerValue;
  teacherName: string;
  plcSheetUrl: string;
}

function buildDefaultVaOptions(defaultTeacherName?: string): VaAssignOptions {
  return {
    className: '',
    sessionSettings: {
      autoPlay: false,
      requireCorrectAnswer: true,
      allowSkipping: false,
    },
    sessionOptions: {
      tabWarningsEnabled: true,
      showResultToStudent: false,
      showCorrectAnswerToStudent: false,
      showCorrectOnBoard: false,
      shuffleQuestions: false,
      shuffleAnswerOptions: true,
      attemptLimit: 1,
      rewindOnIncorrectSeconds: 0,
      pointPenaltyOnIncorrect: 0,
      scoreVisibility: 'score-only',
    },
    picker: makeEmptyPickerValue(),
    teacherName: defaultTeacherName ?? '',
    plcSheetUrl: '',
  };
}

// `REWIND_OPTIONS` and `SCORE_VISIBILITY_OPTIONS` are built inside the
// component via `useMemo` so their labels / hints route through `t()`.
// Module-scope literals would freeze the English strings at import time.

/** Rewind-second values, label-free. The label is `t()`-derived per render. */
const REWIND_SECONDS: readonly number[] = [0, 15, 30, 60];

/**
 * The selectable score-visibility levels in display order. The label and hint
 * for each level live in the component's `t()`-built memo below.
 */
const SCORE_VISIBILITY_VALUES: readonly VideoActivityScoreVisibility[] = [
  'none',
  'score-only',
  'score-and-responses',
  'score-responses-and-answers',
];

function formatRelativeDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export const PlcNewVideoActivityAssignmentModal: React.FC<
  PlcNewVideoActivityAssignmentModalProps
> = ({ plc, assignmentMode = 'submissions', onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user, googleAccessToken } = useAuth();
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
  const submittingRef = useRef(false);

  const pickerItems: PlcSharePickerItem[] = useMemo(
    () =>
      activities.map((a) => ({
        id: a.id,
        title: a.title,
        metaLine: t('plcDashboard.newAssignment.video.metaLine', {
          count: a.questionCount ?? 0,
          date: formatRelativeDate(a.updatedAt ?? a.createdAt ?? 0),
          defaultValue: '{{count}} questions · {{date}}',
        }),
      })),
    [activities, t]
  );

  // Memos must live above the early `return null` / picker-step branches
  // below to satisfy the rules-of-hooks ordering constraint.
  const rewindOptions = useMemo<{ label: string; value: number }[]>(
    () =>
      REWIND_SECONDS.map((value) => ({
        value,
        label:
          value === 0
            ? t('plcDashboard.newAssignment.video.rewindOff', {
                defaultValue: 'Off',
              })
            : t('plcDashboard.newAssignment.video.rewindSeconds', {
                seconds: value,
                defaultValue: '{{seconds}}s',
              }),
      })),
    [t]
  );

  const scoreVisibilityOptions = useMemo<
    { value: VideoActivityScoreVisibility; label: string; hint: string }[]
  >(
    () =>
      SCORE_VISIBILITY_VALUES.map((value) => {
        switch (value) {
          case 'none':
            return {
              value,
              label: t(
                'plcDashboard.newAssignment.video.scoreVisibility.noneLabel',
                { defaultValue: 'Hidden' }
              ),
              hint: t(
                'plcDashboard.newAssignment.video.scoreVisibility.noneHint',
                {
                  defaultValue: "Students see 'Submitted' only — no score.",
                }
              ),
            };
          case 'score-only':
            return {
              value,
              label: t(
                'plcDashboard.newAssignment.video.scoreVisibility.scoreOnlyLabel',
                { defaultValue: 'Score' }
              ),
              hint: t(
                'plcDashboard.newAssignment.video.scoreVisibility.scoreOnlyHint',
                {
                  defaultValue:
                    'Students see their final score, no per-question detail.',
                }
              ),
            };
          case 'score-and-responses':
            return {
              value,
              label: t(
                'plcDashboard.newAssignment.video.scoreVisibility.scoreAndResponsesLabel',
                { defaultValue: 'Score + responses' }
              ),
              hint: t(
                'plcDashboard.newAssignment.video.scoreVisibility.scoreAndResponsesHint',
                {
                  defaultValue:
                    'Students see their score and which questions they got right/wrong.',
                }
              ),
            };
          case 'score-responses-and-answers':
            return {
              value,
              label: t(
                'plcDashboard.newAssignment.video.scoreVisibility.fullReviewLabel',
                { defaultValue: 'Full review' }
              ),
              hint: t(
                'plcDashboard.newAssignment.video.scoreVisibility.fullReviewHint',
                {
                  defaultValue:
                    'Students see their score, right/wrong, and the correct answers.',
                }
              ),
            };
        }
      }),
    [t]
  );

  const plcSheetUrlInvalid =
    !useAutoGenerated &&
    !!options.plcSheetUrl.trim() &&
    !options.plcSheetUrl
      .trim()
      .startsWith('https://docs.google.com/spreadsheets/');

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
      const validRosterIds = options.picker.rosterIds.filter((id) =>
        visibleRosterIds.has(id)
      );
      const selectedRosters: ClassRoster[] = rosters.filter((r) =>
        validRosterIds.includes(r.id)
      );
      const derived = deriveSessionTargetsFromRosters(selectedRosters);

      const trimmedManualUrl = options.plcSheetUrl.trim();
      let resolvedSheetUrl = useAutoGenerated ? '' : trimmedManualUrl;
      let sheetAutoGenerated = false;
      if (useAutoGenerated && !resolvedSheetUrl && googleAccessToken) {
        try {
          const driveService = new QuizDriveService(googleAccessToken);
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
              : t('plcDashboard.newAssignment.video.sheetAutoCreateFailed', {
                  defaultValue:
                    'Could not create the shared PLC sheet — the assignment will be created without one.',
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

      const { id: assignmentId } = await createAssignment(
        {
          id: pickedActivity.id,
          title: pickedActivity.title,
          youtubeUrl: data.youtubeUrl,
          driveFileId: pickedActivity.driveFileId,
          questions: data.questions,
        },
        {
          className: options.className.trim() || pickedActivity.title,
          sessionSettings: options.sessionSettings,
          sessionOptions: options.sessionOptions,
          // Mirror the score-visibility selection onto the top-level
          // `settings.scoreVisibility` field that the assignment doc
          // actually persists — the hook reads this field, not
          // `sessionOptions.scoreVisibility`, when writing the
          // assignment / session docs. (Per-review thread on PR #1598.)
          // Once the teacher runs Publish Scores, the session doc's
          // `scoreVisibility` field is what gates the student grading
          // path; this top-level write is what the publish flow reads
          // back as the default level.
          ...(options.sessionOptions.scoreVisibility
            ? { scoreVisibility: options.sessionOptions.scoreVisibility }
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

      addToast(
        t('plcDashboard.newAssignment.video.created', {
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
          : t('plcDashboard.newAssignment.video.createFailed', {
              defaultValue: 'Failed to create the PLC assignment.',
            }),
        'error'
      );
    } finally {
      submittingRef.current = false;
    }
  }, [
    addToast,
    assignmentMode,
    attachSyncLinkage,
    createAssignment,
    googleAccessToken,
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
        title={t('plcDashboard.newAssignment.video.pickTitle', {
          defaultValue: 'New PLC Video Activity Assignment',
        })}
        subtitle={t('plcDashboard.newAssignment.video.pickSubtitle', {
          name: plc.name,
          defaultValue: 'Shared with {{name}}',
        })}
        prompt={
          isDriveConnected
            ? t('plcDashboard.newAssignment.video.pickPrompt', {
                defaultValue:
                  'Pick a video activity from your personal library. The assignment will be created paused so you can review it before going live.',
              })
            : t('plcDashboard.newAssignment.video.pickPromptNoDrive', {
                defaultValue:
                  'Connect Google Drive in your account to assign video activities from your personal library.',
              })
        }
        emptyMessage={t('plcDashboard.newAssignment.video.pickEmpty', {
          defaultValue:
            "You don't have any video activities in your personal library yet. Create one in the Video Activity widget first.",
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

  const visibleRosterIds = new Set(
    rosters.filter((r) => !r.loadError).map((r) => r.id)
  );
  const effectivePeriodCount = options.picker.rosterIds.filter((id) =>
    visibleRosterIds.has(id)
  ).length;

  const rewind = options.sessionOptions.rewindOnIncorrectSeconds ?? 0;
  const penalty = options.sessionOptions.pointPenaltyOnIncorrect ?? 0;
  const visibility: VideoActivityScoreVisibility =
    options.sessionOptions.scoreVisibility ?? 'score-only';

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
          <AssignClassPicker
            rosters={rosters}
            value={options.picker}
            onChange={(picker) => setOptions((p) => ({ ...p, picker }))}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
            <SectionHeader
              label={t(
                'plcDashboard.newAssignment.video.playerBehavior.title',
                { defaultValue: 'Player Behavior' }
              )}
            />
            <ToggleRow
              label={t(
                'plcDashboard.newAssignment.video.playerBehavior.autoPlayLabel',
                { defaultValue: 'Auto-Play' }
              )}
              hint={t(
                'plcDashboard.newAssignment.video.playerBehavior.autoPlayHint',
                { defaultValue: 'Start video automatically after join' }
              )}
              checked={options.sessionSettings.autoPlay}
              onChange={(v) =>
                setOptions((p) => ({
                  ...p,
                  sessionSettings: { ...p.sessionSettings, autoPlay: v },
                }))
              }
            />
            <ToggleRow
              label={t(
                'plcDashboard.newAssignment.video.playerBehavior.requireCorrectLabel',
                { defaultValue: 'Require Correct Answers' }
              )}
              hint={t(
                'plcDashboard.newAssignment.video.playerBehavior.requireCorrectHint',
                { defaultValue: 'Incorrect answers rewind to section start' }
              )}
              checked={options.sessionSettings.requireCorrectAnswer}
              onChange={(v) =>
                setOptions((p) => ({
                  ...p,
                  sessionSettings: {
                    ...p.sessionSettings,
                    requireCorrectAnswer: v,
                  },
                }))
              }
            />
            <ToggleRow
              label={t(
                'plcDashboard.newAssignment.video.playerBehavior.allowSkippingLabel',
                { defaultValue: 'Allow Skipping' }
              )}
              hint={t(
                'plcDashboard.newAssignment.video.playerBehavior.allowSkippingHint',
                { defaultValue: 'Let students scrub ahead' }
              )}
              checked={options.sessionSettings.allowSkipping}
              onChange={(v) =>
                setOptions((p) => ({
                  ...p,
                  sessionSettings: {
                    ...p.sessionSettings,
                    allowSkipping: v,
                  },
                }))
              }
            />
          </div>

          <AssignmentSettingsToggleGroup
            options={{
              tabWarningsEnabled:
                options.sessionOptions.tabWarningsEnabled ?? true,
              showResultToStudent:
                options.sessionOptions.showResultToStudent ?? false,
              showCorrectAnswerToStudent:
                options.sessionOptions.showCorrectAnswerToStudent ?? false,
              showCorrectOnBoard:
                options.sessionOptions.showCorrectOnBoard ?? false,
              shuffleQuestions:
                options.sessionOptions.shuffleQuestions ?? false,
              shuffleAnswerOptions:
                options.sessionOptions.shuffleAnswerOptions ?? true,
            }}
            onOptionsChange={(next) =>
              setOptions((p) => ({
                ...p,
                sessionOptions: { ...p.sessionOptions, ...next },
              }))
            }
            attemptLimit={options.sessionOptions.attemptLimit ?? null}
            onAttemptLimitChange={(v) =>
              setOptions((p) => ({
                ...p,
                sessionOptions: { ...p.sessionOptions, attemptLimit: v },
              }))
            }
            attemptLimitHint={t(
              'plcDashboard.newAssignment.video.attemptLimitHint',
              {
                defaultValue:
                  'Limit how many times each student can complete the activity. Reset by removing them from the live monitor.',
              }
            )}
            integritySectionLabel={t(
              'plcDashboard.newAssignment.video.integritySectionLabel',
              { defaultValue: 'Activity Integrity' }
            )}
            trailingSlot={
              <div className="space-y-3 pt-1">
                <SectionHeader
                  label={t('plcDashboard.newAssignment.video.scoring.title', {
                    defaultValue: 'Scoring & Penalties',
                  })}
                />
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-brand-blue-dark">
                      {t(
                        'plcDashboard.newAssignment.video.scoring.rewindLabel',
                        { defaultValue: 'Rewind on Incorrect' }
                      )}
                    </span>
                    <div
                      role="group"
                      aria-label={t(
                        'plcDashboard.newAssignment.video.scoring.rewindAriaLabel',
                        { defaultValue: 'Rewind seconds on incorrect answer' }
                      )}
                      className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden"
                    >
                      {rewindOptions.map((opt) => {
                        const active = rewind === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setOptions((p) => ({
                                ...p,
                                sessionOptions: {
                                  ...p.sessionOptions,
                                  rewindOnIncorrectSeconds: opt.value,
                                },
                              }))
                            }
                            className={
                              'px-3 py-1.5 text-xs font-bold transition ' +
                              (active
                                ? 'bg-brand-blue-primary text-white'
                                : 'text-slate-600 hover:bg-slate-50')
                            }
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-xxs text-slate-500 mt-0.5">
                    {t('plcDashboard.newAssignment.video.scoring.rewindHint', {
                      defaultValue:
                        'Send the video back this many seconds when a student answers wrong.',
                    })}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-brand-blue-dark">
                      {t(
                        'plcDashboard.newAssignment.video.scoring.penaltyLabel',
                        { defaultValue: 'Point Penalty per Incorrect' }
                      )}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={penalty}
                      onChange={(e) => {
                        const next = Math.floor(Number(e.target.value));
                        const safe =
                          Number.isFinite(next) && next >= 0 ? next : 0;
                        setOptions((p) => ({
                          ...p,
                          sessionOptions: {
                            ...p.sessionOptions,
                            pointPenaltyOnIncorrect: safe,
                          },
                        }));
                      }}
                      className="w-20 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                    />
                  </div>
                  <p className="text-xxs text-slate-500 mt-0.5">
                    {t('plcDashboard.newAssignment.video.scoring.penaltyHint', {
                      defaultValue:
                        'Subtract this many points each time a student answers wrong. 0 = off.',
                    })}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-brand-blue-dark">
                      {t(
                        'plcDashboard.newAssignment.video.scoring.visibilityLabel',
                        { defaultValue: 'Score Visibility' }
                      )}
                    </span>
                    <select
                      value={visibility}
                      onChange={(e) =>
                        setOptions((p) => ({
                          ...p,
                          sessionOptions: {
                            ...p.sessionOptions,
                            scoreVisibility: e.target
                              .value as VideoActivityScoreVisibility,
                          },
                        }))
                      }
                      className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                    >
                      {scoreVisibilityOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xxs text-slate-500 mt-0.5">
                    {scoreVisibilityOptions.find((o) => o.value === visibility)
                      ?.hint ?? ''}
                  </p>
                </div>
              </div>
            }
          />
        </>
      }
      plcSlot={
        <div className="border-t border-slate-200/70 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-brand-blue-primary" />
              <span className="text-sm font-bold text-brand-blue-dark">
                {t('plcDashboard.newAssignment.sharing.heading', {
                  name: plc.name,
                  defaultValue: 'Sharing with {{name}}',
                })}
              </span>
            </div>
            <span className="text-xxs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
              {t('plcDashboard.newAssignment.sharing.plcMode', {
                defaultValue: 'PLC mode',
              })}
            </span>
          </div>
          <p className="text-xxs text-slate-500 -mt-1">
            {effectivePeriodCount > 1
              ? t('plcDashboard.newAssignment.sharing.periodPickerHint', {
                  defaultValue:
                    'Students will see a class-period picker after entering their PIN.',
                })
              : t('plcDashboard.newAssignment.sharing.singleClassHint', {
                  defaultValue:
                    'Pick two or more classes above to give students a period picker when they join.',
                })}
          </p>
          <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div>
              <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                {t('plcDashboard.newAssignment.sharing.teacherNameLabel', {
                  defaultValue: 'Your Name',
                })}
              </label>
              <input
                type="text"
                value={options.teacherName}
                onChange={(e) =>
                  setOptions((p) => ({ ...p, teacherName: e.target.value }))
                }
                placeholder={t(
                  'plcDashboard.newAssignment.sharing.teacherNamePlaceholder',
                  { defaultValue: 'e.g. Ms. Smith' }
                )}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
              />
              <p className="text-xxs text-slate-400 mt-0.5">
                {t('plcDashboard.newAssignment.sharing.teacherNameHint', {
                  defaultValue:
                    'Appears in the "Teacher" column of the shared sheet.',
                })}
              </p>
            </div>
            <ToggleRow
              label={t('plcDashboard.newAssignment.sharing.autoSheetLabel', {
                defaultValue: 'Auto-Generated PLC Sheet',
              })}
              checked={useAutoGenerated}
              onChange={(v) => {
                setUseAutoGenerated(v);
                if (v) setOptions((p) => ({ ...p, plcSheetUrl: '' }));
              }}
              hint={
                useAutoGenerated
                  ? t('plcDashboard.newAssignment.sharing.autoSheetHintOn', {
                      defaultValue:
                        'SpartBoard creates a fresh Google Sheet for this assignment and shares it with your PLC.',
                    })
                  : t('plcDashboard.newAssignment.sharing.autoSheetHintOff', {
                      defaultValue:
                        'Paste a Google Sheet URL — useful for pointing this assignment at a sheet you already have.',
                    })
              }
            />
            {!useAutoGenerated && (
              <div>
                <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  {t('plcDashboard.newAssignment.sharing.sheetUrlLabel', {
                    defaultValue: 'Shared Google Sheet URL',
                  })}
                </label>
                <input
                  type="text"
                  value={options.plcSheetUrl}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, plcSheetUrl: e.target.value }))
                  }
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                />
                {plcSheetUrlInvalid && (
                  <div className="flex items-center gap-1 mt-1 text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-xxs">
                      {t('plcDashboard.newAssignment.sharing.sheetUrlInvalid', {
                        defaultValue:
                          "This doesn't look like a Google Sheets URL.",
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
            {useAutoGenerated && !googleAccessToken && (
              <p className="text-xxs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                {t('plcDashboard.newAssignment.sharing.driveDisconnectedHint', {
                  defaultValue:
                    "You're not signed into Google — the assignment will be created without a PLC sheet attached. Reconnect Drive and edit the assignment to add one.",
                })}
              </p>
            )}
          </div>
        </div>
      }
    />
  );
};
