// Flashcards tab of the PLC Assessments section: shared sets plus shared class results.

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  Share2,
  Trash2,
  Users2,
} from 'lucide-react';
import type {
  Plc,
  PlcFlashcardResultEntry,
  PlcFlashcardSetEntry,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { useFlashcardSets } from '@/hooks/useFlashcardSets';
import {
  toPersonalFlashcardSet,
  usePlcFlashcardResults,
  usePlcFlashcardSets,
  writePlcFlashcardSetEntry,
} from '@/hooks/usePlcFlashcards';
import { getPlcMemberEmail } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { PlcSharePickerModal } from '@/components/plc/PlcSharePickerModal';
import { PlcViewerReadOnlyBadge } from '@/components/plc/viewer/PlcViewerReadOnlyBadge';
import { tourAttr } from '@/config/tourAnchors';

interface PlcFlashcardsBodyProps {
  plc: Plc;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const sharerLabel = (entry: {
  sharedByName: string;
  sharedByEmail: string;
}): string => entry.sharedByName.trim() || entry.sharedByEmail || '';

const pct = (correct: number, answered: number): number =>
  answered === 0 ? 0 : Math.round((correct / answered) * 100);

export const PlcFlashcardResultRow: React.FC<{
  entry: PlcFlashcardResultEntry;
}> = ({ entry }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isCheck = entry.kind === 'check';
  const cards = useMemo(
    () =>
      entry.cards
        .filter((c) => c.answered > 0)
        .sort(
          (a, b) => pct(a.correct, a.answered) - pct(b.correct, b.answered)
        ),
    [entry.cards]
  );
  const meta = [
    sharerLabel(entry),
    entry.classLabel,
    isCheck
      ? t('plcDashboard.flashcards.check', { defaultValue: 'Check' })
      : t('plcDashboard.flashcards.study', { defaultValue: 'Study' }),
    formatDate(entry.updatedAt),
  ].filter(Boolean);

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <button
        {...tourAttr('plc-flashcards.set-expand')}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="shrink-0 w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-pink-700" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800 truncate">
            {entry.setTitle}
          </div>
          <div className="text-xxs text-slate-500 mt-0.5 truncate">
            {meta.join(' · ')}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-slate-800">
            {Math.round(entry.averagePercent)}%
          </div>
          <div className="text-xxs text-slate-500">
            {isCheck
              ? t('plcDashboard.flashcards.submitted', {
                  done: entry.completed,
                  total: entry.students,
                  defaultValue: '{{done}}/{{total}} submitted',
                })
              : t('plcDashboard.flashcards.started', {
                  done: entry.completed,
                  total: entry.students,
                  defaultValue: '{{done}}/{{total}} started',
                })}
          </div>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          {cards.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              {t('plcDashboard.flashcards.noAnswers', {
                defaultValue: 'No answers yet',
              })}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-xxs uppercase tracking-wider text-slate-400">
                  <th className="py-1 font-bold">
                    {t('plcDashboard.flashcards.term', {
                      defaultValue: 'Term',
                    })}
                  </th>
                  <th className="py-1 font-bold text-right">
                    {t('plcDashboard.flashcards.correct', {
                      defaultValue: 'Correct',
                    })}
                  </th>
                  <th className="py-1 font-bold text-right">
                    {t('plcDashboard.flashcards.answers', {
                      defaultValue: 'Answers',
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card, i) => (
                  <tr
                    key={`${card.term}-${i}`}
                    className="border-t border-slate-100"
                  >
                    <td className="py-1.5 pr-2 text-slate-700">
                      <div className="font-semibold truncate">{card.term}</div>
                      <div className="text-slate-500 truncate">
                        {card.definition}
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-bold text-slate-800">
                      {pct(card.correct, card.answered)}%
                    </td>
                    <td className="py-1.5 text-right text-slate-500">
                      {card.answered}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export const PlcFlashcardSetRow: React.FC<{
  entry: PlcFlashcardSetEntry;
  busy: boolean;
  canEdit: boolean;
  onImport: () => void;
  onUnshare: () => void;
}> = ({ entry, busy, canEdit, onImport, onUnshare }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center">
        <Layers className="w-4 h-4 text-pink-700" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-800 truncate">
          {entry.title || 'Untitled set'}
        </div>
        <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="truncate flex items-center gap-1">
            <Users2 className="w-3 h-3" aria-hidden="true" />
            {sharerLabel(entry)}
          </span>
          <span className="text-slate-300">•</span>
          <span>
            {t('plcDashboard.flashcards.cardCount', {
              count: entry.cards.length,
              defaultValue: '{{count}} card',
              defaultValue_other: '{{count}} cards',
            })}
          </span>
          <span className="text-slate-300">•</span>
          <span>{formatDate(entry.sharedAt)}</span>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <button
          {...tourAttr('plc-flashcards.import')}
          type="button"
          onClick={onImport}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          {t('plcDashboard.flashcards.import', {
            defaultValue: 'Add to my library',
          })}
        </button>
        {canEdit && (
          <button
            {...tourAttr('plc-flashcards.unshare')}
            type="button"
            onClick={onUnshare}
            disabled={busy}
            aria-label={t('plcDashboard.flashcards.unshareLabel', {
              title: entry.title,
              defaultValue: 'Unshare {{title}}',
            })}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export const PlcFlashcardsBody: React.FC<PlcFlashcardsBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user, canAccessFeature } = useAuth();
  const groupWording = canAccessFeature('my-groups');
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const canEdit = useCanEditPlcContent();
  const { sets: personalSets, saveSet } = useFlashcardSets(user?.uid);
  const { sets, loading, error, unshareSet } = usePlcFlashcardSets(plc.id);
  const {
    results,
    loading: resultsLoading,
    error: resultsError,
  } = usePlcFlashcardResults(plc.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sharedIds = useMemo(() => new Set(sets.map((s) => s.id)), [sets]);
  const pickerItems = useMemo(
    () =>
      personalSets.map((set) => ({
        id: set.id,
        title: set.title || 'Untitled set',
        metaLine: t('plcDashboard.flashcards.cardCount', {
          count: set.cards.length,
          defaultValue: '{{count}} card',
          defaultValue_other: '{{count}} cards',
        }),
        alreadyShared: sharedIds.has(set.id),
      })),
    [personalSets, sharedIds, t]
  );

  const handleShare = useCallback(
    async (setId: string) => {
      const set = personalSets.find((s) => s.id === setId);
      if (!user || !set) return;
      try {
        const outcome = await writePlcFlashcardSetEntry(plc.id, user.uid, {
          set,
          sharedByName: user.displayName ?? '',
          sharedByEmail:
            getPlcMemberEmail(plc, user.uid) ??
            (user.email ? user.email.toLowerCase() : ''),
        });
        addToast(
          outcome === 'already-shared'
            ? t('plcDashboard.flashcards.alreadyShared', {
                title: set.title,
                defaultValue: '"{{title}}" is already shared.',
              })
            : t('plcDashboard.flashcards.shared', {
                title: set.title,
                defaultValue: '"{{title}}" shared.',
              }),
          outcome === 'already-shared' ? 'info' : 'success'
        );
        setPickerOpen(false);
      } catch (err) {
        logError('PlcFlashcardsBody.share', err, { plcId: plc.id, setId });
        addToast(
          t('plcDashboard.flashcards.shareFailed', {
            defaultValue: 'Could not share the set.',
          }),
          'error'
        );
      }
    },
    [addToast, personalSets, plc, t, user]
  );

  const handleImport = useCallback(
    async (entryId: string) => {
      const entry = sets.find((s) => s.id === entryId);
      if (!entry) return;
      setBusyId(entryId);
      try {
        await saveSet(toPersonalFlashcardSet(entry));
        addToast(
          t('plcDashboard.flashcards.imported', {
            title: entry.title,
            defaultValue: '"{{title}}" added to your flashcards.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcFlashcardsBody.import', err, { plcId: plc.id, entryId });
        addToast(
          t('plcDashboard.flashcards.importFailed', {
            defaultValue: 'Could not add the set.',
          }),
          'error'
        );
      } finally {
        setBusyId(null);
      }
    },
    [addToast, plc.id, saveSet, sets, t]
  );

  const handleUnshare = useCallback(
    async (entryId: string, title: string) => {
      const confirmed = await showConfirm(
        groupWording
          ? t('plcDashboard.flashcards.groupUnshareConfirm', {
              title,
              defaultValue: 'Remove "{{title}}" from this group?',
            })
          : t('plcDashboard.flashcards.unshareConfirm', {
              title,
              defaultValue: 'Remove "{{title}}" from this PLC?',
            }),
        {
          title: t('plcDashboard.flashcards.unshareTitle', {
            defaultValue: 'Unshare set',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.flashcards.unshare', {
            defaultValue: 'Unshare',
          }),
        }
      );
      if (!confirmed) return;
      setBusyId(entryId);
      try {
        await unshareSet(entryId);
      } catch (err) {
        logError('PlcFlashcardsBody.unshare', err, { plcId: plc.id, entryId });
        addToast(
          t('plcDashboard.flashcards.unshareFailed', {
            defaultValue: 'Could not unshare the set.',
          }),
          'error'
        );
      } finally {
        setBusyId(null);
      }
    },
    [addToast, groupWording, plc.id, showConfirm, t, unshareSet]
  );

  if (loading || resultsLoading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center py-10 text-slate-400"
      >
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const heading = (label: string, count: number, cta?: React.ReactNode) => (
    <div className="flex items-baseline justify-between mb-1">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
        {label}
      </h3>
      <div className="flex items-center gap-3">
        <span className="text-xxs text-slate-400">{count}</span>
        {cta}
      </div>
    </div>
  );

  const loadError = (
    <div
      role="alert"
      className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
    >
      {t('plcDashboard.flashcards.loadError', {
        defaultValue: "Couldn't load. Please try again.",
      })}
    </div>
  );

  const empty = (label: string) => (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
      {label}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 px-1 pb-6">
      {heading(
        t('plcDashboard.flashcards.setsHeading', {
          defaultValue: 'Shared Sets',
        }),
        sets.length,
        canEdit ? (
          <button
            {...tourAttr('plc-flashcards.share')}
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            {t('plcDashboard.flashcards.shareCta', {
              defaultValue: 'Share a set',
            })}
          </button>
        ) : undefined
      )}

      {error
        ? loadError
        : sets.length === 0
          ? empty(
              t('plcDashboard.flashcards.noSets', {
                defaultValue: 'No shared sets yet',
              })
            )
          : sets.map((entry) => (
              <PlcFlashcardSetRow
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                canEdit={canEdit}
                onImport={() => void handleImport(entry.id)}
                onUnshare={() => void handleUnshare(entry.id, entry.title)}
              />
            ))}

      <div className="mt-4">
        {heading(
          t('plcDashboard.flashcards.resultsHeading', {
            defaultValue: 'Shared Results',
          }),
          results.length
        )}
      </div>
      {resultsError
        ? loadError
        : results.length === 0
          ? empty(
              t('plcDashboard.flashcards.noResults', {
                defaultValue: 'No shared results yet',
              })
            )
          : results.map((entry) => (
              <PlcFlashcardResultRow key={entry.id} entry={entry} />
            ))}

      {!canEdit && <PlcViewerReadOnlyBadge />}

      {pickerOpen && (
        <PlcSharePickerModal
          title={t('plcDashboard.flashcards.pickerTitle', {
            defaultValue: 'Share a flashcard set',
          })}
          subtitle={plc.name}
          emptyMessage={t('plcDashboard.flashcards.pickerEmpty', {
            defaultValue: 'No flashcard sets yet',
          })}
          items={pickerItems}
          onPick={handleShare}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};
