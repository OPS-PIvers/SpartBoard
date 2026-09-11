// Question Banks tab of the PLC Assessments section: lists banks members shared with this PLC.

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Library,
  Loader2,
  Share2,
  Trash2,
  Users2,
} from 'lucide-react';
import type { Plc, PlcQuestionBankEntry } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { useQuestionBanks } from '@/hooks/useQuestionBanks';
import { usePlcQuestionBankEntries } from '@/hooks/usePlcQuestionBanks';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { loadSyncedBankContent } from '@/hooks/useBankSources';
import { logError } from '@/utils/logError';
import { PlcSharePickerModal } from '@/components/plc/PlcSharePickerModal';
import { PlcViewerReadOnlyBadge } from '@/components/plc/viewer/PlcViewerReadOnlyBadge';

interface PlcQuestionBanksBodyProps {
  plc: Plc;
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

export const PlcQuestionBanksBody: React.FC<PlcQuestionBanksBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const canEdit = useCanEditPlcContent();
  const {
    banks,
    saveBank,
    shareBankWithPlc,
    unshareBankFromPlc,
    isDriveConnected,
  } = useQuestionBanks(user?.uid);
  const { entries, loading, error } = usePlcQuestionBankEntries(plc.id);
  const { list: targetList } = usePlcLearningTargets(plc.id);

  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const targetById = useMemo(
    () => new Map((targetList?.targets ?? []).map((tg) => [tg.id, tg])),
    [targetList]
  );

  const pickerItems = useMemo(
    () =>
      banks.map((b) => ({
        id: b.id,
        title: b.title,
        metaLine: t('plcDashboard.bankLibrary.pickerMeta', {
          count: b.questionCount,
          defaultValue: '{{count}} question',
          defaultValue_other: '{{count}} questions',
        }),
        alreadyShared: (b.sync?.plcIds ?? []).includes(plc.id),
      })),
    [banks, plc.id, t]
  );

  const handleShare = useCallback(
    async (bankId: string) => {
      const meta = banks.find((b) => b.id === bankId);
      if (!meta) return;
      try {
        await shareBankWithPlc(meta, plc.id);
        addToast(
          t('plcDashboard.bankLibrary.sharedToast', {
            title: meta.title,
            defaultValue: '"{{title}}" shared with this PLC.',
          }),
          'success'
        );
        setSharePickerOpen(false);
      } catch (err) {
        logError('PlcQuestionBanksBody.share', err, { plcId: plc.id, bankId });
        addToast(
          t('plcDashboard.bankLibrary.shareFailed', {
            defaultValue: 'Failed to share question bank with this PLC.',
          }),
          'error'
        );
      }
    },
    [addToast, banks, plc.id, shareBankWithPlc, t]
  );

  const handleImport = useCallback(
    async (entry: PlcQuestionBankEntry) => {
      setBusyRowId(entry.id);
      try {
        const content = await loadSyncedBankContent(entry.syncGroupId);
        const now = Date.now();
        await saveBank({
          id: crypto.randomUUID(),
          title: content.title,
          questions: content.questions,
          ...(content.stimuli ? { stimuli: content.stimuli } : {}),
          ...(content.targets ? { targets: content.targets } : {}),
          createdAt: now,
          updatedAt: now,
        });
        addToast(
          t('plcDashboard.bankLibrary.importedToast', {
            title: entry.title,
            defaultValue: '"{{title}}" added to your question banks.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcQuestionBanksBody.import', err, {
          plcId: plc.id,
          entryId: entry.id,
        });
        addToast(
          t('plcDashboard.bankLibrary.importFailed', {
            defaultValue: 'Failed to copy question bank.',
          }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, plc.id, saveBank, t]
  );

  const handleUnshare = useCallback(
    async (entry: PlcQuestionBankEntry) => {
      const meta = banks.find((b) => b.sync?.groupId === entry.syncGroupId);
      if (!meta) {
        addToast(
          t('plcDashboard.bankLibrary.unshareNotReady', {
            defaultValue:
              'Your question banks are still loading. Try again in a moment.',
          }),
          'info'
        );
        return;
      }
      const confirmed = await showConfirm(
        t('plcDashboard.bankLibrary.unshareConfirm', {
          title: entry.title,
          defaultValue:
            'Stop sharing "{{title}}" with this PLC? Teammates’ quizzes that draw from it will stop resolving; copies in their libraries keep working.',
        }),
        {
          title: t('plcDashboard.bankLibrary.unshareTitle', {
            defaultValue: 'Stop sharing bank',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.bankLibrary.unshareAction', {
            defaultValue: 'Stop sharing',
          }),
        }
      );
      if (!confirmed) return;
      setBusyRowId(entry.id);
      try {
        await unshareBankFromPlc(meta, plc.id);
      } catch (err) {
        logError('PlcQuestionBanksBody.unshare', err, {
          plcId: plc.id,
          entryId: entry.id,
        });
        addToast(
          t('plcDashboard.bankLibrary.unshareFailed', {
            defaultValue: 'Failed to stop sharing question bank.',
          }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, banks, plc.id, showConfirm, t, unshareBankFromPlc]
  );

  if (loading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center py-10 text-slate-400"
      >
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t('plcDashboard.bankLibrary.loading', {
            defaultValue: 'Loading question banks…',
          })}
        </span>
      </div>
    );
  }

  const shareCta = canEdit ? (
    <button
      type="button"
      onClick={() => setSharePickerOpen(true)}
      disabled={!isDriveConnected}
      title={
        !isDriveConnected
          ? t('plcDashboard.bankLibrary.driveDisconnected', {
              defaultValue: 'Connect Google Drive to share a question bank.',
            })
          : undefined
      }
      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
      {t('plcDashboard.bankLibrary.shareCta', {
        defaultValue: 'Share a bank',
      })}
    </button>
  ) : null;

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.bankLibrary.heading', {
            defaultValue: 'Shared Question Banks',
          })}
        </h3>
        <div className="flex items-center gap-3">
          {!error && (
            <span className="text-xxs text-slate-400">
              {t('plcDashboard.bankLibrary.count', {
                count: entries.length,
                defaultValue: '{{count}} bank',
                defaultValue_other: '{{count}} banks',
              })}
            </span>
          )}
          {shareCta}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {t('plcDashboard.bankLibrary.loadError', {
            defaultValue:
              "Couldn't load shared question banks. Please try again.",
          })}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <Library
            className="w-6 h-6 mx-auto text-slate-400"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-bold text-slate-700">
            {t('plcDashboard.bankLibrary.empty', {
              defaultValue: 'No shared question banks yet',
            })}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('plcDashboard.bankLibrary.emptyHint', {
              defaultValue:
                'Share a bank from your quiz library so teammates can draw tagged questions into their own quizzes.',
            })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const ownerLabel =
              entry.sharedByName?.trim() ||
              entry.sharedByEmail ||
              t('plcDashboard.bankLibrary.unknownSharer', {
                defaultValue: 'a teammate',
              });
            const isBusy = busyRowId === entry.id;
            const isOwner = !!user && entry.sharedBy === user.uid;
            const targets = entry.targetIds
              .map((id) => targetById.get(id))
              .filter((tg): tg is NonNullable<typeof tg> => !!tg);
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                  <Library
                    className="w-4 h-4 text-brand-blue-primary"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {entry.title}
                  </div>
                  <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="truncate flex items-center gap-1">
                      <Users2 className="w-3 h-3" aria-hidden="true" />
                      {t('plcDashboard.bankLibrary.bySharer', {
                        name: ownerLabel,
                        defaultValue: 'shared by {{name}}',
                      })}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      {t('plcDashboard.bankLibrary.questionCount', {
                        count: entry.questionCount,
                        defaultValue: '{{count}} question',
                        defaultValue_other: '{{count}} questions',
                      })}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{formatDate(entry.sharedAt)}</span>
                  </div>
                  {targets.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {targets.map((tg) => (
                        <span
                          key={tg.id}
                          className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-xxs font-semibold text-slate-600"
                          title={tg.label}
                        >
                          <span className="truncate">
                            {tg.code ?? tg.label}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {!isOwner && (
                    <button
                      type="button"
                      onClick={() => void handleImport(entry)}
                      disabled={isBusy || !isDriveConnected}
                      title={
                        !isDriveConnected
                          ? t(
                              'plcDashboard.bankLibrary.driveDisconnectedCopy',
                              {
                                defaultValue:
                                  'Connect Google Drive to copy a question bank.',
                              }
                            )
                          : undefined
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('plcDashboard.bankLibrary.importAction', {
                        defaultValue: 'Copy to my banks',
                      })}
                    </button>
                  )}
                  {isOwner && canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleUnshare(entry)}
                      disabled={isBusy}
                      aria-label={t('plcDashboard.bankLibrary.unshareLabel', {
                        title: entry.title,
                        defaultValue: 'Stop sharing {{title}}',
                      })}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!canEdit && (
        <PlcViewerReadOnlyBadge
          note={t('plcDashboard.viewer.banksNote', {
            defaultValue:
              'Viewers can browse and copy shared question banks but can’t share them.',
          })}
        />
      )}

      {sharePickerOpen && (
        <PlcSharePickerModal
          title={t('plcDashboard.bankLibrary.sharePickerTitle', {
            defaultValue: 'Share a question bank with this PLC',
          })}
          subtitle={plc.name}
          prompt={t('plcDashboard.bankLibrary.sharePickerPrompt', {
            defaultValue: 'Pick a bank from your quiz library.',
          })}
          emptyMessage={t('plcDashboard.bankLibrary.sharePickerEmpty', {
            defaultValue:
              'You don’t have any question banks yet. Build one in the Quiz widget’s Banks tab.',
          })}
          items={pickerItems}
          onPick={handleShare}
          onClose={() => setSharePickerOpen(false)}
        />
      )}
    </div>
  );
};
