/**
 * PlcVideoActivitiesBody — Phase 4 body for the PLC Video Activity Library.
 *
 * Mirrors `PlcQuizLibraryBody` in shape and lifecycle. Owns the row list,
 * the import modal, and the inline editor for the canonical activity.
 *
 *   - "Add to my library" — opens `PlcVideoActivityImportModal` (sync-or-
 *     copy picker). On Sync we pull canonical content from
 *     `synced_video_activities/{groupId}`, save a fresh personal copy,
 *     join the synced group via `callJoinPlcVideoActivitySyncGroup`, and
 *     attach the sync linkage so the user's library card thereafter
 *     surfaces the "Synced" / "Sync available" pills. On Copy we just
 *     pull canonical and save a fresh personal copy (no sync linkage).
 *
 *   - "Edit" — opens `VideoActivityEditorModal` against the user's
 *     personal copy. If the user doesn't yet have one, we auto-import via
 *     Sync mode first so the editor has a Drive-backed canonical to
 *     write into. Saving calls `saveActivity`, which writes to Drive +
 *     mirrors header onto Firestore.
 *
 *     NOTE — unlike `useQuiz.saveQuiz`, `useVideoActivity.saveActivity`
 *     does NOT detect synced-group version conflicts at save time. A
 *     teammate publishing concurrently to the same group will lose to
 *     last-writer-wins on `synced_video_activities/{groupId}`. The
 *     synced-group publish itself is debounced LWW per field via
 *     `useSyncedVideoActivityGroups`, so the canonical doesn't tear; the
 *     local copy's `lastSyncedVersion` may briefly lag until the next
 *     sync-aware pull. This is consistent with the Phase 4 scope ("LWW
 *     matches every other surface in the app") and the cost of building
 *     version-conflict UX is reserved for a future iteration.
 *
 *   - "Unshare" — any current member can remove a PLC video activity
 *     entry (PLC-owned model). The canonical synced group doc is left in
 *     place; orphan-tolerant per the Phase 2/Phase 4 spec.
 *
 *   - Already-imported indicator — when the user's personal library
 *     carries `sync.groupId === plcVideoActivity.syncGroupId`, the row
 *     shows an "In your library" badge. Re-importing in Sync mode is a
 *     no-op (informational toast); Copy mode still creates a fresh
 *     snapshot.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Pencil,
  Trash2,
  Users2,
} from 'lucide-react';
import type { Plc, VideoActivityData, VideoActivityMetadata } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { usePlcVideoActivities } from '@/hooks/usePlcVideoActivities';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import type { SharedVideoActivityImportMode } from '@/hooks/useVideoActivityAssignments';
import {
  callJoinPlcVideoActivitySyncGroup,
  callLeaveSyncedVideoActivityGroup,
  pullSyncedVideoActivityContent,
} from '@/hooks/useSyncedVideoActivityGroups';
import { logError } from '@/utils/logError';
import { PlcVideoActivityImportModal } from '../PlcVideoActivityImportModal';
import { VideoActivityEditorModal } from '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal';

interface PlcVideoActivitiesBodyProps {
  plc: Plc;
}

interface ImportTarget {
  plcVideoActivityId: string;
  syncGroupId: string;
  title: string;
  sharedByName: string;
}

function formatDate(ms: number): string {
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

export const PlcVideoActivitiesBody: React.FC<PlcVideoActivitiesBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const {
    videoActivities: plcEntries,
    loading,
    unshareVideoActivityFromPlc,
  } = usePlcVideoActivities(plc.id);
  const {
    activities: personalActivities,
    saveActivity,
    deleteActivity,
    attachSyncLinkage,
    loadActivityData,
    isDriveConnected,
  } = useVideoActivity(user?.uid);

  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    activity: VideoActivityData;
    meta: VideoActivityMetadata;
  } | null>(null);

  const personalBySyncGroup = useMemo(() => {
    const map = new Map<string, VideoActivityMetadata>();
    for (const a of personalActivities) {
      if (a.sync?.groupId) map.set(a.sync.groupId, a);
    }
    return map;
  }, [personalActivities]);

  const handleImport = useCallback(
    async (target: ImportTarget, mode: SharedVideoActivityImportMode) => {
      if (!user) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.videoActivities.driveRequired', {
            defaultValue:
              'Connect Google Drive in your account to import PLC video activities.',
          }),
          'error'
        );
        return;
      }

      if (mode === 'sync' && personalBySyncGroup.has(target.syncGroupId)) {
        setImportTarget(null);
        addToast(
          t('plcDashboard.videoActivities.alreadySynced', {
            title: target.title,
            defaultValue: '"{{title}}" is already synced to your library.',
          }),
          'info'
        );
        return;
      }

      setImportTarget(null);
      setBusyRowId(target.plcVideoActivityId);
      let savedMeta: Awaited<ReturnType<typeof saveActivity>> | null = null;
      let joinedGroupId: string | null = null;
      try {
        const canonical = await pullSyncedVideoActivityContent(
          target.syncGroupId
        );
        const now = Date.now();
        const fresh: VideoActivityData = {
          id: crypto.randomUUID(),
          title: canonical.title,
          youtubeUrl: canonical.youtubeUrl,
          questions: canonical.questions,
          createdAt: now,
          updatedAt: now,
        };
        savedMeta = await saveActivity(fresh);
        if (mode === 'sync') {
          const joinResult = await callJoinPlcVideoActivitySyncGroup(
            plc.id,
            target.plcVideoActivityId
          );
          joinedGroupId = joinResult.groupId;
          const liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
          addToast(
            t('plcDashboard.videoActivities.importedSync', {
              title: target.title,
              defaultValue: '"{{title}}" added to your library (synced).',
            }),
            'success'
          );
        } else {
          addToast(
            t('plcDashboard.videoActivities.importedCopy', {
              title: target.title,
              defaultValue: '"{{title}}" copied to your library.',
            }),
            'success'
          );
        }
      } catch (err) {
        logError('PlcVideoActivitiesBody.import', err, {
          plcId: plc.id,
          plcVideoActivityId: target.plcVideoActivityId,
          mode,
        });
        // Rollback path mirrors PlcQuizLibraryBody: if we joined the
        // synced group before the failure, leave it so we don't pollute
        // the participants map with a non-member. Likewise, if we saved
        // a local copy before the failure, delete it. Both rollback
        // calls are best-effort.
        if (joinedGroupId) {
          try {
            await callLeaveSyncedVideoActivityGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('PlcVideoActivitiesBody.import.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteActivity(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError(
              'PlcVideoActivitiesBody.import.rollbackActivity',
              rollbackErr,
              {
                plcId: plc.id,
                activityId: savedMeta.id,
                driveFileId: savedMeta.driveFileId,
              }
            );
          }
        }
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.videoActivities.importFailed', {
                defaultValue: 'Failed to import video activity.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [
      addToast,
      attachSyncLinkage,
      deleteActivity,
      isDriveConnected,
      personalBySyncGroup,
      plc.id,
      saveActivity,
      t,
      user,
    ]
  );

  const handleEdit = useCallback(
    async (target: ImportTarget) => {
      if (!user) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.videoActivities.driveRequiredForEdit', {
            defaultValue:
              'Connect Google Drive in your account to edit PLC video activities.',
          }),
          'error'
        );
        return;
      }

      setBusyRowId(target.plcVideoActivityId);
      let savedMeta: Awaited<ReturnType<typeof saveActivity>> | null = null;
      let joinedGroupId: string | null = null;
      let autoImported = false;
      try {
        let personalMeta: VideoActivityMetadata | undefined =
          personalBySyncGroup.get(target.syncGroupId);
        if (!personalMeta) {
          autoImported = true;
          const canonical = await pullSyncedVideoActivityContent(
            target.syncGroupId
          );
          const now = Date.now();
          const fresh: VideoActivityData = {
            id: crypto.randomUUID(),
            title: canonical.title,
            youtubeUrl: canonical.youtubeUrl,
            questions: canonical.questions,
            createdAt: now,
            updatedAt: now,
          };
          savedMeta = await saveActivity(fresh);
          const joinResult = await callJoinPlcVideoActivitySyncGroup(
            plc.id,
            target.plcVideoActivityId
          );
          joinedGroupId = joinResult.groupId;
          const liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
          personalMeta = {
            ...savedMeta,
            sync: {
              groupId: target.syncGroupId,
              lastSyncedVersion: liveVersion,
            },
          };
        }

        const activityData = await loadActivityData(personalMeta.driveFileId);
        setEditing({
          activity: activityData,
          meta: personalMeta,
        });
        if (autoImported) {
          addToast(
            t('plcDashboard.videoActivities.editAutoImported', {
              title: target.title,
              defaultValue:
                '"{{title}}" added to your library — opening editor.',
            }),
            'info'
          );
        }
      } catch (err) {
        logError('PlcVideoActivitiesBody.edit', err, {
          plcId: plc.id,
          plcVideoActivityId: target.plcVideoActivityId,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedVideoActivityGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('PlcVideoActivitiesBody.edit.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteActivity(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError(
              'PlcVideoActivitiesBody.edit.rollbackActivity',
              rollbackErr,
              {
                plcId: plc.id,
                activityId: savedMeta.id,
                driveFileId: savedMeta.driveFileId,
              }
            );
          }
        }
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.videoActivities.editFailed', {
                defaultValue: 'Failed to open editor.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [
      addToast,
      attachSyncLinkage,
      deleteActivity,
      isDriveConnected,
      loadActivityData,
      personalBySyncGroup,
      plc.id,
      saveActivity,
      t,
      user,
    ]
  );

  const handleSaveEdit = useCallback(
    async (updated: VideoActivityData) => {
      if (!editing) return;
      // `saveActivity` writes to Drive + Firestore unconditionally. The
      // synced-group publish (if `meta.sync` is set) happens via
      // `useSyncedVideoActivityGroups` LWW machinery downstream — that
      // layer handles per-field debouncing and concurrent edits across
      // teammates. We deliberately don't surface version-conflict UX
      // here; see the file header for the rationale.
      await saveActivity(updated, editing.meta.driveFileId);
      addToast(
        t('plcDashboard.videoActivities.editSaved', {
          defaultValue:
            'Video activity saved — teammates will sync on next refresh.',
        }),
        'success'
      );
    },
    [addToast, editing, saveActivity, t]
  );

  const handleUnshare = useCallback(
    async (plcVideoActivityId: string, title: string) => {
      const confirmed = await showConfirm(
        t('plcDashboard.videoActivities.unshareConfirm', {
          title,
          defaultValue:
            'Remove "{{title}}" from this PLC? Other teammates will lose access to the shared library entry. Their personal copies (if any) keep working.',
        }),
        {
          title: t('plcDashboard.videoActivities.unshareTitle', {
            defaultValue: 'Unshare video activity',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.videoActivities.unshareAction', {
            defaultValue: 'Unshare',
          }),
        }
      );
      if (!confirmed) return;
      setBusyRowId(plcVideoActivityId);
      try {
        await unshareVideoActivityFromPlc(plcVideoActivityId);
        addToast(
          t('plcDashboard.videoActivities.unshared', {
            title,
            defaultValue: '"{{title}}" removed from this PLC.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcVideoActivitiesBody.unshare', err, {
          plcId: plc.id,
          plcVideoActivityId,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.videoActivities.unshareFailed', {
                defaultValue: 'Failed to unshare video activity.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, plc.id, showConfirm, t, unshareVideoActivityFromPlc]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (plcEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <Film className="w-7 h-7 text-slate-400" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.videoActivities.emptyTitle', {
            defaultValue: 'No shared video activities yet',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.videoActivities.emptySubtitle', {
            defaultValue:
              'Open the Video Activity widget in your dashboard, click the kebab on any activity, and choose "Share with PLC" to add it here.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.videoActivities.heading', {
            defaultValue: 'Shared Video Activities',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.videoActivities.count', {
            count: plcEntries.length,
            defaultValue: '{{count}} activity',
            defaultValue_other: '{{count}} activities',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {plcEntries.map((activity) => {
          const isMine = activity.sharedBy === user?.uid;
          const ownerLabel =
            activity.sharedByName?.trim() ||
            activity.sharedByEmail ||
            t('plcDashboard.videoActivities.unknownSharer', {
              defaultValue: 'a teammate',
            });
          const inLibrary = personalBySyncGroup.has(activity.syncGroupId);
          const isBusy = busyRowId === activity.id;
          return (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                <Film
                  className="w-4 h-4 text-brand-blue-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {activity.title}
                  </div>
                  {inLibrary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      <Cloud className="w-3 h-3" aria-hidden="true" />
                      {t('plcDashboard.videoActivities.inLibrary', {
                        defaultValue: 'In your library',
                      })}
                    </span>
                  )}
                </div>
                <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate flex items-center gap-1">
                    <Users2 className="w-3 h-3" aria-hidden="true" />
                    {t('plcDashboard.videoActivities.bySharer', {
                      name: ownerLabel,
                      defaultValue: 'shared by {{name}}',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>
                    {t('plcDashboard.videoActivities.questionCount', {
                      count: activity.questionCount,
                      defaultValue: '{{count}} question',
                      defaultValue_other: '{{count}} questions',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(activity.updatedAt)}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setImportTarget({
                      plcVideoActivityId: activity.id,
                      syncGroupId: activity.syncGroupId,
                      title: activity.title,
                      sharedByName: activity.sharedByName,
                    })
                  }
                  disabled={isBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  title={
                    inLibrary
                      ? t('plcDashboard.videoActivities.reimport', {
                          defaultValue: 'Re-import',
                        })
                      : t('plcDashboard.videoActivities.addToMyLibrary', {
                          defaultValue: 'Add to my library',
                        })
                  }
                >
                  {isBusy ? (
                    <Loader2
                      className="w-3 h-3 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Download className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">
                    {inLibrary
                      ? t('plcDashboard.videoActivities.reimport', {
                          defaultValue: 'Re-import',
                        })
                      : t('plcDashboard.videoActivities.addToMyLibrary', {
                          defaultValue: 'Add to my library',
                        })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleEdit({
                      plcVideoActivityId: activity.id,
                      syncGroupId: activity.syncGroupId,
                      title: activity.title,
                      sharedByName: activity.sharedByName,
                    })
                  }
                  disabled={isBusy || !isDriveConnected}
                  aria-label={t('plcDashboard.videoActivities.editAction', {
                    defaultValue: 'Edit',
                  })}
                  title={
                    inLibrary
                      ? t('plcDashboard.videoActivities.editTooltip', {
                          defaultValue:
                            'Edit collaboratively (changes sync to teammates)',
                        })
                      : t(
                          'plcDashboard.videoActivities.editTooltipAutoImport',
                          {
                            defaultValue:
                              'Edit collaboratively — adds to your library on first edit',
                          }
                        )
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-brand-blue-lighter hover:text-brand-blue-primary transition-colors disabled:opacity-40"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleUnshare(activity.id, activity.title)
                  }
                  disabled={isBusy}
                  aria-label={t('plcDashboard.videoActivities.unshareAction', {
                    defaultValue: 'Unshare',
                  })}
                  title={
                    isMine
                      ? t('plcDashboard.videoActivities.unshareYours', {
                          defaultValue: 'Unshare from PLC',
                        })
                      : t('plcDashboard.videoActivities.unshareTeammate', {
                          defaultValue:
                            'Unshare from PLC (any member can remove)',
                        })
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!isDriveConnected && (
        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <ExternalLink
            className="w-4 h-4 text-amber-700 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <p className="text-xs text-amber-800">
            {t('plcDashboard.videoActivities.driveDisconnected', {
              defaultValue:
                'Connect Google Drive to import PLC video activities into your personal library.',
            })}
          </p>
        </div>
      )}
      {importTarget && (
        <PlcVideoActivityImportModal
          activityTitle={importTarget.title}
          sharedByName={importTarget.sharedByName}
          onPick={(mode) => void handleImport(importTarget, mode)}
          onClose={() => setImportTarget(null)}
        />
      )}
      <VideoActivityEditorModal
        isOpen={editing !== null}
        activity={editing?.activity ?? null}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};
