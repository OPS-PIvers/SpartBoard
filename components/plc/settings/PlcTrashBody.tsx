import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Film,
  ListChecks,
  Loader2,
  MessageSquare,
  RotateCcw,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { Plc } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  usePlcTrash,
  type PlcTrashItem,
  type PlcTrashItemType,
} from '@/hooks/usePlcTrash';
import { logError } from '@/utils/logError';

interface PlcTrashBodyProps {
  plc: Plc;
}

/** Per-type icon + label keys for a Trash row. Light-surface palette (the Trash
 * view lives inside Settings, on white cards). */
const TYPE_META: Record<
  PlcTrashItemType,
  { icon: typeof StickyNote; labelKey: string; labelDefault: string }
> = {
  note: {
    icon: StickyNote,
    labelKey: 'plcDashboard.trash.type.note',
    labelDefault: 'Note',
  },
  todo: {
    icon: ListChecks,
    labelKey: 'plcDashboard.trash.type.todo',
    labelDefault: 'To-do',
  },
  doc: {
    icon: BookOpen,
    labelKey: 'plcDashboard.trash.type.doc',
    labelDefault: 'Doc',
  },
  comment: {
    icon: MessageSquare,
    labelKey: 'plcDashboard.trash.type.comment',
    labelDefault: 'Comment',
  },
  quiz: {
    icon: BookOpen,
    labelKey: 'plcDashboard.trash.type.quiz',
    labelDefault: 'Quiz',
  },
  videoActivity: {
    icon: Film,
    labelKey: 'plcDashboard.trash.type.videoActivity',
    labelDefault: 'Video activity',
  },
};

function formatDate(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Trash view (Decision 3.1, §6.1) — lives inside Settings. Lists every
 * soft-deleted item across the PLC's content types (notes, to-dos, docs,
 * comments, quizzes, video activities) with a per-row Restore action. Restore
 * clears the `deletedAt` tombstone and logs an `item_restored` activity event
 * (handled by `usePlcTrash`). Items are GC'd server-side after 30 days
 * (Wave-4 `gcPlcOrphans`).
 */
export const PlcTrashBody: React.FC<PlcTrashBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { items, loading, error, restore } = usePlcTrash(plc.id);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (item: PlcTrashItem) => {
    if (restoringId) return;
    setRestoringId(item.id);
    try {
      await restore(item);
      addToast(
        t('plcDashboard.trash.restored', {
          defaultValue: 'Restored',
        }),
        'success'
      );
    } catch (err) {
      logError('PlcTrashBody.restore', err, {
        plcId: plc.id,
        itemId: item.id,
        type: item.type,
      });
      addToast(
        t('plcDashboard.trash.restoreFailed', {
          defaultValue: "Couldn't restore that item.",
        }),
        'error'
      );
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        {t('plcDashboard.trash.description', {
          defaultValue:
            'Deleted items are kept here for 30 days. Restore anything you removed by mistake.',
        })}
      </p>

      {error ? (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {t('plcDashboard.trash.loadError', {
            defaultValue: "Couldn't load Trash. Please try again.",
          })}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8 bg-white rounded-2xl border border-dashed border-slate-200">
          <Trash2 className="w-6 h-6 text-slate-300 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">
            {t('plcDashboard.trash.empty', {
              defaultValue: 'Trash is empty',
            })}
          </p>
          <p className="text-xxs text-slate-400 mt-1">
            {t('plcDashboard.trash.emptySubtitle', {
              defaultValue: 'Deleted items will appear here.',
            })}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const isRestoring = restoringId === item.id;
            const typeLabel = t(meta.labelKey, {
              defaultValue: meta.labelDefault,
            });
            const rowTitle =
              item.title.trim() ||
              t('plcDashboard.trash.untitled', { defaultValue: 'Untitled' });
            return (
              <li
                key={`${item.type}:${item.id}`}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {rowTitle}
                  </div>
                  <div className="text-xxs text-slate-500 mt-0.5">
                    {typeLabel}
                    {item.deletedAt > 0 && (
                      <>
                        {' · '}
                        {t('plcDashboard.trash.deletedWhen', {
                          defaultValue: 'Deleted {{when}}',
                          when: formatDate(item.deletedAt),
                        })}
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRestore(item)}
                  disabled={restoringId !== null}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1"
                  aria-label={t('plcDashboard.trash.restoreItem', {
                    defaultValue: 'Restore "{{title}}"',
                    title: rowTitle,
                  })}
                >
                  {isRestoring ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  {t('plcDashboard.trash.restore', { defaultValue: 'Restore' })}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
