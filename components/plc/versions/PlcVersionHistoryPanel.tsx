/**
 * PlcVersionHistoryPanel — version-history + restore surface for the synced
 * quiz / video-activity library cards (Wave-4 T3, PRD §5.1 / §3.10, Decision
 * 5.1).
 *
 * Opened from the "Version history" affordance on a synced row (quiz or video
 * activity). Lists the bounded snapshots captured by the publish path
 * (`listSyncedVersions` / `listSyncedVideoActivityVersions`, already
 * newest-first) and exposes a "Restore this version" action that re-publishes
 * the snapshot's content through the version-precondition publish path
 * (`restoreSyncedVersion` / `restoreSyncedVideoActivityVersion`).
 *
 * Permissions: this panel is only mounted for participants (callers gate the
 * trigger behind `canEditPlcContent`, hiding it for viewers). It does not
 * re-check the role itself — the rules layer hard-denies a viewer's restore
 * write regardless.
 *
 * Concurrency: a restore is itself a publish, so a teammate's concurrent edit
 * throws `SyncedQuizVersionConflictError` / `SyncedVideoActivityVersionConflictError`.
 * We catch it, surface the calm "another teacher just published" toast, and
 * reload the snapshot list (the pre-restore content is itself snapshotted, so
 * nothing is lost) — the same conflict-toast + reload pattern the editor save
 * paths use.
 *
 * Surface: this renders inside the PLC light-surface library (white card on
 * slate), so muted text uses the light-surface palette (`text-slate-500/600`)
 * per the project's contrast guidance — dark-surface 300/200 rules do NOT
 * apply here. Interactive controls carry focus rings and icon-only buttons
 * carry aria-labels.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Loader2, RotateCcw } from 'lucide-react';
import type { Plc, SyncedVersionSnapshot } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { Modal } from '@/components/common/Modal';
import { getPlcMembers } from '@/utils/plc';
import { logError } from '@/utils/logError';
import {
  SyncedQuizVersionConflictError,
  listSyncedVersions,
  restoreSyncedVersion,
} from '@/hooks/useSyncedQuizGroups';
import {
  SyncedVideoActivityVersionConflictError,
  listSyncedVideoActivityVersions,
  restoreSyncedVideoActivityVersion,
} from '@/hooks/useSyncedVideoActivityGroups';

export type PlcVersionKind = 'quiz' | 'video-activity';

interface PlcVersionHistoryPanelProps {
  plc: Plc;
  /** Canonical synced-group id whose history this panel lists. */
  groupId: string;
  /** Which synced collection the group lives in (routes list/restore calls). */
  kind: PlcVersionKind;
  /** Human title of the assessment, shown in the header + aria-labels. */
  title: string;
  onClose: () => void;
}

function formatWhen(ms: number, locale: string): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export const PlcVersionHistoryPanel: React.FC<PlcVersionHistoryPanelProps> = ({
  plc,
  groupId,
  kind,
  title,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();

  const [snapshots, setSnapshots] = useState<SyncedVersionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // Resolve a snapshot's savedBy uid → display name from the PLC members map,
  // falling back to a generic teammate label for legacy/absent members.
  const displayNameFor = useCallback(
    (uid: string): string => {
      const member = getPlcMembers(plc).find((m) => m.uid === uid);
      const name = member?.displayName?.trim();
      if (name) return name;
      return t('plcDashboard.versions.unknownAuthor', {
        defaultValue: 'a teammate',
      });
    },
    [plc, t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const list =
        kind === 'quiz'
          ? await listSyncedVersions(groupId)
          : await listSyncedVideoActivityVersions(groupId);
      setSnapshots(list);
    } catch (err) {
      logError('PlcVersionHistoryPanel.load', err, { plcId: plc.id, groupId });
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, kind, plc.id]);

  // External system (Firestore one-shot read) — effect is the right tool here.
  useEffect(() => {
    void load();
  }, [load]);

  const handleRestore = useCallback(
    async (version: number) => {
      if (!user || restoringVersion !== null) return;
      setRestoringVersion(version);
      try {
        if (kind === 'quiz') {
          await restoreSyncedVersion(groupId, version, user.uid);
        } else {
          await restoreSyncedVideoActivityVersion(groupId, version, user.uid);
        }
        addToast(
          t('plcDashboard.versions.restored', {
            version,
            title,
            defaultValue:
              'Restored version {{version}} of "{{title}}". Teammates sync on next refresh.',
          }),
          'success'
        );
        onClose();
      } catch (err) {
        if (
          err instanceof SyncedQuizVersionConflictError ||
          err instanceof SyncedVideoActivityVersionConflictError
        ) {
          // Concurrent peer publish — surface the calm conflict toast and
          // reload the (now-extended) snapshot list. Nothing is lost: the
          // pre-restore content was snapshotted before this restore failed.
          addToast(
            t('plcDashboard.versions.conflict', {
              defaultValue:
                'Another teacher just published an update. We reloaded the version history — review it and try the restore again.',
            }),
            'warning'
          );
          await load();
          return;
        }
        logError('PlcVersionHistoryPanel.restore', err, {
          plcId: plc.id,
          groupId,
          version,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.versions.restoreFailed', {
                defaultValue: 'Couldn’t restore that version. Try again.',
              }),
          'error'
        );
      } finally {
        setRestoringVersion(null);
      }
    },
    [
      addToast,
      groupId,
      kind,
      load,
      onClose,
      plc.id,
      restoringVersion,
      t,
      title,
      user,
    ]
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel={t('plcDashboard.versions.ariaLabel', {
        title,
        defaultValue: 'Version history for {{title}}',
      })}
      maxWidth="max-w-lg"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <History className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                {t('plcDashboard.versions.title', {
                  defaultValue: 'Version history',
                })}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[22rem]">
                {title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('plcDashboard.versions.close', {
              defaultValue: 'Close',
            })}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          >
            <span className="sr-only">
              {t('plcDashboard.versions.close', { defaultValue: 'Close' })}
            </span>
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4">
        <p className="text-xs text-slate-600 mb-3">
          {t('plcDashboard.versions.intro', {
            defaultValue:
              'Recent saved versions of this shared assessment. Restoring re-publishes that version to everyone — the current version is kept in history too.',
          })}
        </p>

        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-10 text-slate-500"
          >
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>
              {t('plcDashboard.versions.loading', {
                defaultValue: 'Loading version history…',
              })}
            </span>
          </div>
        ) : loadError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-600 mb-3">
              {t('plcDashboard.versions.loadError', {
                defaultValue: 'Couldn’t load version history.',
              })}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            >
              {t('plcDashboard.versions.retry', {
                defaultValue: 'Try again',
              })}
            </button>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <History className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-slate-700">
              {t('plcDashboard.versions.emptyTitle', {
                defaultValue: 'No previous versions yet',
              })}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              {t('plcDashboard.versions.emptySubtitle', {
                defaultValue:
                  'Earlier versions appear here after the next edit is published.',
              })}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((snap) => {
              const when = formatWhen(snap.savedAt, i18n.language);
              const author = displayNameFor(snap.savedBy);
              const isRestoring = restoringVersion === snap.version;
              const anyRestoring = restoringVersion !== null;
              return (
                <li
                  key={snap.version}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">
                    {t('plcDashboard.versions.versionShort', {
                      version: snap.version,
                      defaultValue: 'v{{version}}',
                    })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">
                      {t('plcDashboard.versions.versionLabel', {
                        version: snap.version,
                        defaultValue: 'Version {{version}}',
                      })}
                    </div>
                    <div className="text-xxs text-slate-500 mt-0.5 truncate">
                      {t('plcDashboard.versions.savedByAt', {
                        name: author,
                        when,
                        defaultValue: 'Saved by {{name}} · {{when}}',
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRestore(snap.version)}
                    disabled={anyRestoring}
                    aria-label={t('plcDashboard.versions.restoreAriaLabel', {
                      version: snap.version,
                      defaultValue: 'Restore version {{version}}',
                    })}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                  >
                    {isRestoring ? (
                      <Loader2
                        className="w-3 h-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    )}
                    <span>
                      {t('plcDashboard.versions.restoreAction', {
                        defaultValue: 'Restore this version',
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
};
