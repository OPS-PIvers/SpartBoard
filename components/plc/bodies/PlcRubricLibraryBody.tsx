/**
 * PlcRubricLibraryBody — the Rubrics tab of the PLC Assessments section
 * (M12 Phase 3-I).
 *
 * Mirrors `PlcVideoActivitiesBody`'s library shape, minus the sync plumbing:
 * a PLC rubric doc carries the full inline payload, so
 *
 *   - Share   — pick a personal rubric (`useRubrics`) and write the PLC doc
 *               with attribution. Non-viewer members only.
 *   - Import  — copy the PLC rubric into the personal library via
 *               `saveRubric` with a fresh id and timestamps (attribution
 *               stripped).
 *   - Unshare — soft-delete tombstone, matching the quiz library's
 *               PLC-owned model.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardCheck,
  Download,
  Loader2,
  Share2,
  Trash2,
  Users2,
} from 'lucide-react';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { useRubrics } from '@/hooks/useRubrics';
import { usePlcRubrics, toPortableRubric } from '@/hooks/usePlcRubrics';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { getPlcMemberEmail } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { PlcSharePickerModal } from '@/components/plc/PlcSharePickerModal';
import { PlcViewerReadOnlyBadge } from '@/components/plc/viewer/PlcViewerReadOnlyBadge';

interface PlcRubricLibraryBodyProps {
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

export const PlcRubricLibraryBody: React.FC<PlcRubricLibraryBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const canEdit = useCanEditPlcContent();
  const { rubrics: personalRubrics, saveRubric } = useRubrics(user?.uid);
  const {
    rubrics: plcRubrics,
    loading,
    error,
    shareRubricWithPlc,
    unshareRubricFromPlc,
  } = usePlcRubrics(plc.id);

  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  // Share preserves the source id, so id equality is the only sound test —
  // titles collide across genuinely different rubrics. Tombstoned entries are
  // absent here on purpose: re-sharing one revives it.
  const sharedIds = useMemo(
    () => new Set(plcRubrics.map((entry) => entry.id)),
    [plcRubrics]
  );

  const pickerItems = useMemo(
    () =>
      personalRubrics.map((r) => ({
        id: r.id,
        title: r.title,
        metaLine: t('plcDashboard.rubricLibrary.pickerMeta', {
          criteria: r.criteria.length,
          points: rubricMaxPoints(r),
          defaultValue: '{{criteria}} criteria · {{points}} pts',
        }),
        alreadyShared: sharedIds.has(r.id),
      })),
    [personalRubrics, sharedIds, t]
  );

  const handleShare = useCallback(
    async (rubricId: string) => {
      if (!user) return;
      const rubric = personalRubrics.find((r) => r.id === rubricId);
      if (!rubric) return;
      try {
        const ownerEmailLower =
          getPlcMemberEmail(plc, user.uid) ??
          (user.email ? user.email.toLowerCase() : '');
        const outcome = await shareRubricWithPlc({
          rubric,
          sharedByName: user.displayName ?? '',
          sharedByEmail: ownerEmailLower,
        });
        if (outcome === 'already-shared') {
          addToast(
            t('plcDashboard.rubricLibrary.alreadySharedToast', {
              title: rubric.title,
              defaultValue: '"{{title}}" is already shared with this PLC.',
            }),
            'info'
          );
        } else {
          addToast(
            outcome === 'restored'
              ? t('plcDashboard.rubricLibrary.resharedToast', {
                  title: rubric.title,
                  defaultValue: '"{{title}}" is shared with this PLC again.',
                })
              : t('plcDashboard.rubricLibrary.sharedToast', {
                  title: rubric.title,
                  defaultValue: '"{{title}}" shared with this PLC.',
                }),
            'success'
          );
        }
        setSharePickerOpen(false);
      } catch (err) {
        logError('PlcRubricLibraryBody.share', err, {
          plcId: plc.id,
          rubricId,
        });
        addToast(
          t('plcDashboard.rubricLibrary.shareFailed', {
            defaultValue: 'Failed to share rubric with this PLC.',
          }),
          'error'
        );
      }
    },
    [addToast, personalRubrics, plc, shareRubricWithPlc, t, user]
  );

  const handleImport = useCallback(
    async (entryId: string) => {
      const entry = plcRubrics.find((r) => r.id === entryId);
      if (!entry) return;
      setBusyRowId(entryId);
      try {
        const now = Date.now();
        await saveRubric({
          ...toPortableRubric(entry),
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        });
        addToast(
          t('plcDashboard.rubricLibrary.importedToast', {
            title: entry.title,
            defaultValue: '"{{title}}" added to your rubric library.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcRubricLibraryBody.import', err, {
          plcId: plc.id,
          entryId,
        });
        addToast(
          t('plcDashboard.rubricLibrary.importFailed', {
            defaultValue: 'Failed to import rubric.',
          }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, plc.id, plcRubrics, saveRubric, t]
  );

  const handleUnshare = useCallback(
    async (entryId: string, title: string) => {
      const confirmed = await showConfirm(
        t('plcDashboard.rubricLibrary.unshareConfirm', {
          title,
          defaultValue:
            'Remove "{{title}}" from this PLC? Teammates lose access to the shared entry; copies already in their libraries keep working.',
        }),
        {
          title: t('plcDashboard.rubricLibrary.unshareTitle', {
            defaultValue: 'Unshare rubric',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.rubricLibrary.unshareAction', {
            defaultValue: 'Unshare',
          }),
        }
      );
      if (!confirmed) return;
      setBusyRowId(entryId);
      try {
        await unshareRubricFromPlc(entryId);
      } catch (err) {
        logError('PlcRubricLibraryBody.unshare', err, {
          plcId: plc.id,
          entryId,
        });
        addToast(
          t('plcDashboard.rubricLibrary.unshareFailed', {
            defaultValue: 'Failed to unshare rubric.',
          }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, plc.id, showConfirm, t, unshareRubricFromPlc]
  );

  if (loading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center py-10 text-slate-400"
      >
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t('plcDashboard.rubricLibrary.loading', {
            defaultValue: 'Loading rubrics…',
          })}
        </span>
      </div>
    );
  }

  const shareCta = canEdit ? (
    <button
      type="button"
      onClick={() => setSharePickerOpen(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
    >
      <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
      {t('plcDashboard.rubricLibrary.shareCta', {
        defaultValue: 'Share a rubric',
      })}
    </button>
  ) : null;

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.rubricLibrary.heading', {
            defaultValue: 'Shared Rubrics',
          })}
        </h3>
        <div className="flex items-center gap-3">
          {!error && (
            <span className="text-xxs text-slate-400">
              {t('plcDashboard.rubricLibrary.count', {
                count: plcRubrics.length,
                defaultValue: '{{count}} rubric',
                defaultValue_other: '{{count}} rubrics',
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
          {t('plcDashboard.rubricLibrary.loadError', {
            defaultValue: "Couldn't load shared rubrics. Please try again.",
          })}
        </div>
      ) : plcRubrics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <ClipboardCheck
            className="w-6 h-6 mx-auto text-slate-400"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-bold text-slate-700">
            {t('plcDashboard.rubricLibrary.empty', {
              defaultValue: 'No shared rubrics yet',
            })}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('plcDashboard.rubricLibrary.emptyHint', {
              defaultValue:
                'Share a rubric from your library so your team can score written responses the same way.',
            })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {plcRubrics.map((entry) => {
            const ownerLabel =
              entry.sharedByName?.trim() ||
              entry.sharedByEmail ||
              t('plcDashboard.rubricLibrary.unknownSharer', {
                defaultValue: 'a teammate',
              });
            const isBusy = busyRowId === entry.id;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                  <ClipboardCheck
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
                      {t('plcDashboard.rubricLibrary.bySharer', {
                        name: ownerLabel,
                        defaultValue: 'shared by {{name}}',
                      })}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      {t('plcDashboard.rubricLibrary.criterionCount', {
                        count: entry.criteria.length,
                        defaultValue: '{{count}} criterion',
                        defaultValue_other: '{{count}} criteria',
                      })}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      {t('plcDashboard.rubricLibrary.maxPoints', {
                        points: rubricMaxPoints(entry),
                        defaultValue: '{{points}} pts',
                      })}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{formatDate(entry.sharedAt)}</span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleImport(entry.id)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('plcDashboard.rubricLibrary.importAction', {
                      defaultValue: 'Add to my library',
                    })}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleUnshare(entry.id, entry.title)}
                      disabled={isBusy}
                      aria-label={t('plcDashboard.rubricLibrary.unshareLabel', {
                        title: entry.title,
                        defaultValue: 'Unshare {{title}}',
                      })}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-brand-red-primary/10 hover:text-brand-red-primary transition-colors disabled:opacity-40"
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
          note={t('plcDashboard.viewer.rubricsNote', {
            defaultValue:
              'Viewers can browse and copy shared rubrics but can’t share or unshare them.',
          })}
        />
      )}

      {sharePickerOpen && (
        <PlcSharePickerModal
          title={t('plcDashboard.rubricLibrary.sharePickerTitle', {
            defaultValue: 'Share a rubric with this PLC',
          })}
          subtitle={plc.name}
          prompt={t('plcDashboard.rubricLibrary.sharePickerPrompt', {
            defaultValue: 'Pick a rubric from your library.',
          })}
          emptyMessage={t('plcDashboard.rubricLibrary.sharePickerEmpty', {
            defaultValue:
              'You don’t have any rubrics yet. Build one from a written question in the quiz editor.',
          })}
          items={pickerItems}
          onPick={handleShare}
          onClose={() => setSharePickerOpen(false)}
        />
      )}
    </div>
  );
};
