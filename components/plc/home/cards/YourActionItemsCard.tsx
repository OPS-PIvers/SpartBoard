/**
 * YourActionItemsCard — Home card listing the to-dos assigned to the signed-in
 * member, with due dates (PRD §6.3, Decision 4.1).
 *
 * Reads the PLC's shared to-do list (`usePlcTodos` — a standalone hook here
 * because the todos listener is NOT gated to the `home` section) and filters to
 * the member's own OPEN items, urgency-sorted (overdue → soonest → undated).
 * Each row shows a relative due-date chip and a checkbox to mark it done inline.
 *
 * Action items spawned from meetings (`meetingId` provenance) surface here just
 * like list-created ones — that's the point of Decision 3.9: the meeting's "Act"
 * step lands work on each teacher's Home.
 *
 * Light-surface modal chrome (Home page) — normal Tailwind sizing, no cqmin.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Circle,
  ChevronRight,
  ListChecks,
  Loader2,
} from 'lucide-react';

import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcTodos } from '@/hooks/usePlcTodos';
import { logError } from '@/utils/logError';
import type { PlcSectionId } from '@/components/plc/sections';
import {
  selectMyActionItems,
  type ActionItemView,
  type DueBucket,
} from './yourActionItems';

interface YourActionItemsCardProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

const PREVIEW_LIMIT = 5;

/** Due-chip color treatment per urgency bucket (light surface). */
const BUCKET_CHIP: Record<DueBucket, string> = {
  overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  today: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  soon: 'bg-brand-blue-lighter text-brand-blue-primary ring-1 ring-brand-blue-light/40',
  later: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  none: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
};

export const YourActionItemsCard: React.FC<YourActionItemsCardProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { todos, loading, error, toggleDone } = usePlcTodos(plc.id);

  // Capture "now" once at mount via a lazy state initializer (the repo pattern
  // for keeping `Date.now()` out of the render body). The card doesn't need
  // second-precision freshness for due-date bucketing, and re-seeding on a timer
  // would churn renders for no UX gain.
  const [now] = useState(() => Date.now());
  const items = useMemo(
    () => selectMyActionItems(todos, user?.uid ?? null, now),
    [todos, user?.uid, now]
  );
  const preview = items.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-blue-lighter">
          <ListChecks
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
        </div>
        <h3 className="flex-1 min-w-0 text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.home.actionItems.heading', {
            defaultValue: 'Your action items',
          })}
        </h3>
        {items.length > 0 && (
          <span className="ml-auto inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-brand-blue-primary px-1.5 text-xs font-bold text-white">
            {items.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          </div>
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center py-8 text-center"
            role="alert"
          >
            <AlertCircle
              className="w-8 h-8 text-brand-red-primary/70 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-600">
              {t('plcDashboard.home.actionItems.loadError', {
                defaultValue: "Couldn't load your action items",
              })}
            </p>
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2
              className="w-8 h-8 text-emerald-300 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-500">
              {t('plcDashboard.home.actionItems.empty', {
                defaultValue: "You're all caught up",
              })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('plcDashboard.home.actionItems.emptySubtitle', {
                defaultValue: 'Action items assigned to you will appear here.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {preview.map((item) => (
              <ActionItemRow
                key={item.todo.id}
                item={item}
                onToggle={async () => {
                  try {
                    await toggleDone(item.todo.id, true);
                  } catch (err) {
                    logError('YourActionItemsCard.toggleDone', err, {
                      plcId: plc.id,
                      todoId: item.todo.id,
                    });
                    addToast(
                      t('plcDashboard.home.actionItems.toggleFailed', {
                        defaultValue: "Couldn't update that action item.",
                      }),
                      'error'
                    );
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer CTA — jump to the full To-Do list */}
      <button
        type="button"
        onClick={() => onNavigate('todos')}
        className="flex items-center justify-center gap-1.5 border-t border-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-brand-blue-primary transition-colors hover:bg-brand-blue-lighter/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {t('plcDashboard.home.actionItems.openAll', {
          defaultValue: 'Open To-Do list',
        })}
        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

const ActionItemRow: React.FC<{
  item: ActionItemView;
  onToggle: () => Promise<void>;
}> = ({ item, onToggle }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const { todo, bucket } = item;

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle();
    } finally {
      setBusy(false);
    }
  };

  const dueLabel = formatDueLabel(t, todo.dueAt ?? null, bucket);

  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-slate-50">
      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={busy}
        aria-label={t('plcDashboard.home.actionItems.markDone', {
          defaultValue: 'Mark done',
        })}
        className="shrink-0 rounded-full text-slate-300 transition-colors hover:text-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Circle className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
      <span className="flex-1 min-w-0 truncate text-sm text-slate-700">
        {todo.text}
      </span>
      {dueLabel && (
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BUCKET_CHIP[bucket]}`}
        >
          <CalendarClock className="w-3 h-3" aria-hidden="true" />
          {dueLabel}
        </span>
      )}
    </li>
  );
};

/**
 * Human-readable due chip text. Overdue / today get their own words; everything
 * else shows a short localized date. Returns null when there's no due date (the
 * chip is then omitted entirely).
 */
function formatDueLabel(
  t: ReturnType<typeof useTranslation>['t'],
  dueAt: number | null,
  bucket: DueBucket
): string | null {
  if (dueAt == null) return null;
  if (bucket === 'overdue') {
    return t('plcDashboard.home.actionItems.due.overdue', {
      defaultValue: 'Overdue',
    });
  }
  if (bucket === 'today') {
    return t('plcDashboard.home.actionItems.due.today', {
      defaultValue: 'Today',
    });
  }
  try {
    return new Date(dueAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}
