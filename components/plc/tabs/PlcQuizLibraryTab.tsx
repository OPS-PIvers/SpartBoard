/**
 * PlcQuizLibraryTab — Phase 2.
 *
 * Lists every quiz that any PLC member has shared with this PLC. Each
 * row supports:
 *
 *   - "Add to my library" — opens `PlcQuizImportModal` (sync-or-copy
 *     picker). On Sync we pull the canonical content, save a fresh
 *     personal copy, join the synced group via Cloud Function, and
 *     attach the sync linkage so the user's library card thereafter
 *     surfaces the "Synced" / "Sync available" pills. On Copy we just
 *     pull canonical and save a fresh personal copy (no sync linkage).
 *
 *   - "Unshare" — any current member can remove a PLC quiz entry
 *     (PLC-owned model — quizzes shared with the PLC belong to the PLC,
 *     not the original sharer). The canonical `synced_quizzes/{groupId}`
 *     doc is intentionally left in place; orphan-tolerant per the
 *     Phase 2 spec.
 *
 *   - Already-imported indicator — when the user's personal library
 *     already carries a `sync.groupId === plcQuiz.syncGroupId`, the row
 *     shows an "In your library" badge and the import action becomes
 *     non-destructive (still allowed; reuses existing linkage).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Cloud,
  Download,
  ExternalLink,
  Loader2,
  Trash2,
  Users2,
} from 'lucide-react';
import type { Plc, QuizData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';
import { useQuiz } from '@/hooks/useQuiz';
import {
  callJoinPlcQuizSyncGroup,
  pullSyncedQuizContent,
} from '@/hooks/useSyncedQuizGroups';
import type { SharedAssignmentImportMode } from '@/hooks/useQuizAssignments';
import { logError } from '@/utils/logError';
import { PlcQuizImportModal } from '../PlcQuizImportModal';

interface PlcQuizLibraryTabProps {
  plc: Plc;
}

interface ImportTarget {
  plcQuizId: string;
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

export const PlcQuizLibraryTab: React.FC<PlcQuizLibraryTabProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const {
    quizzes: plcQuizzes,
    loading,
    unshareQuizFromPlc,
  } = usePlcQuizzes(plc.id);
  const {
    quizzes: personalQuizzes,
    saveQuiz,
    attachSyncLinkage,
    isDriveConnected,
  } = useQuiz(user?.uid);

  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  // Map of syncGroupId → personal quiz that already carries this linkage.
  // Used to render the "In your library" badge and to skip a redundant
  // re-import.
  const personalBySyncGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of personalQuizzes) {
      if (q.sync?.groupId) map.set(q.sync.groupId, q.id);
    }
    return map;
  }, [personalQuizzes]);

  const handleImport = useCallback(
    async (target: ImportTarget, mode: SharedAssignmentImportMode) => {
      if (!user) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.quizLibrary.driveRequired', {
            defaultValue:
              'Connect Google Drive in your account to import PLC quizzes.',
          }),
          'error'
        );
        return;
      }
      setImportTarget(null);
      setBusyRowId(target.plcQuizId);
      try {
        const canonical = await pullSyncedQuizContent(target.syncGroupId);
        const now = Date.now();
        const fresh: QuizData = {
          id: crypto.randomUUID(),
          title: canonical.title,
          questions: canonical.questions,
          createdAt: now,
          updatedAt: now,
        };
        const savedMeta = await saveQuiz(fresh);
        if (mode === 'sync') {
          // Server-side participant write must precede the client-side
          // attachSyncLinkage so a later editor save doesn't try to
          // publish from a non-participant context.
          await callJoinPlcQuizSyncGroup(plc.id, target.plcQuizId);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: canonical.version,
          });
          addToast(
            t('plcDashboard.quizLibrary.importedSync', {
              title: target.title,
              defaultValue: '"{{title}}" added to your library (synced).',
            }),
            'success'
          );
        } else {
          addToast(
            t('plcDashboard.quizLibrary.importedCopy', {
              title: target.title,
              defaultValue: '"{{title}}" copied to your library.',
            }),
            'success'
          );
        }
      } catch (err) {
        logError('PlcQuizLibraryTab.import', err, {
          plcId: plc.id,
          plcQuizId: target.plcQuizId,
          mode,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.quizLibrary.importFailed', {
                defaultValue: 'Failed to import quiz.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, attachSyncLinkage, isDriveConnected, plc.id, saveQuiz, t, user]
  );

  const handleUnshare = useCallback(
    async (plcQuizId: string, title: string) => {
      const confirmed = await showConfirm(
        t('plcDashboard.quizLibrary.unshareConfirm', {
          title,
          defaultValue:
            'Remove "{{title}}" from this PLC? Other teammates will lose access to the shared library entry. Their personal copies (if any) keep working.',
        }),
        {
          title: t('plcDashboard.quizLibrary.unshareTitle', {
            defaultValue: 'Unshare quiz',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.quizLibrary.unshareAction', {
            defaultValue: 'Unshare',
          }),
        }
      );
      if (!confirmed) return;
      setBusyRowId(plcQuizId);
      try {
        await unshareQuizFromPlc(plcQuizId);
        addToast(
          t('plcDashboard.quizLibrary.unshared', {
            title,
            defaultValue: '"{{title}}" removed from this PLC.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcQuizLibraryTab.unshare', err, {
          plcId: plc.id,
          plcQuizId,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.quizLibrary.unshareFailed', {
                defaultValue: 'Failed to unshare quiz.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, plc.id, showConfirm, t, unshareQuizFromPlc]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (plcQuizzes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <BookOpen className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.quizLibrary.emptyTitle', {
            defaultValue: 'No shared quizzes yet',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.quizLibrary.emptySubtitle', {
            defaultValue:
              'Open the Quiz widget in your dashboard, click the kebab on any quiz, and choose "Share with PLC" to add it here.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.quizLibrary.heading', {
            defaultValue: 'Shared Quizzes',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.quizLibrary.count', {
            count: plcQuizzes.length,
            defaultValue: '{{count}} quiz',
            defaultValue_other: '{{count}} quizzes',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {plcQuizzes.map((quiz) => {
          const isMine = quiz.sharedBy === user?.uid;
          const ownerLabel =
            quiz.sharedByName?.trim() ||
            quiz.sharedByEmail ||
            t('plcDashboard.quizLibrary.unknownSharer', {
              defaultValue: 'a teammate',
            });
          const inLibrary = personalBySyncGroup.has(quiz.syncGroupId);
          const isBusy = busyRowId === quiz.id;
          return (
            <div
              key={quiz.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-brand-blue-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {quiz.title}
                  </div>
                  {inLibrary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      <Cloud className="w-3 h-3" />
                      {t('plcDashboard.quizLibrary.inLibrary', {
                        defaultValue: 'In your library',
                      })}
                    </span>
                  )}
                </div>
                <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate flex items-center gap-1">
                    <Users2 className="w-3 h-3" />
                    {t('plcDashboard.quizLibrary.bySharer', {
                      name: ownerLabel,
                      defaultValue: 'shared by {{name}}',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>
                    {t('plcDashboard.quizLibrary.questionCount', {
                      count: quiz.questionCount,
                      defaultValue: '{{count}} question',
                      defaultValue_other: '{{count}} questions',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(quiz.updatedAt)}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setImportTarget({
                      plcQuizId: quiz.id,
                      syncGroupId: quiz.syncGroupId,
                      title: quiz.title,
                      sharedByName: quiz.sharedByName,
                    })
                  }
                  disabled={isBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  title={
                    inLibrary
                      ? t('plcDashboard.quizLibrary.reimport', {
                          defaultValue: 'Re-import',
                        })
                      : t('plcDashboard.quizLibrary.addToMyLibrary', {
                          defaultValue: 'Add to my library',
                        })
                  }
                >
                  {isBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline">
                    {inLibrary
                      ? t('plcDashboard.quizLibrary.reimport', {
                          defaultValue: 'Re-import',
                        })
                      : t('plcDashboard.quizLibrary.addToMyLibrary', {
                          defaultValue: 'Add to my library',
                        })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleUnshare(quiz.id, quiz.title)}
                  disabled={isBusy}
                  aria-label={t('plcDashboard.quizLibrary.unshareAction', {
                    defaultValue: 'Unshare',
                  })}
                  title={
                    isMine
                      ? t('plcDashboard.quizLibrary.unshareYours', {
                          defaultValue: 'Unshare from PLC',
                        })
                      : t('plcDashboard.quizLibrary.unshareTeammate', {
                          defaultValue:
                            'Unshare from PLC (any member can remove)',
                        })
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!isDriveConnected && (
        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <ExternalLink className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            {t('plcDashboard.quizLibrary.driveDisconnected', {
              defaultValue:
                'Connect Google Drive to import PLC quizzes into your personal library.',
            })}
          </p>
        </div>
      )}
      {importTarget && (
        <PlcQuizImportModal
          quizTitle={importTarget.title}
          sharedByName={importTarget.sharedByName}
          onPick={(mode) => void handleImport(importTarget, mode)}
          onClose={() => setImportTarget(null)}
        />
      )}
    </div>
  );
};
