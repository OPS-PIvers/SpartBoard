// Action items + activity tile: what I owe first, then what changed since my last visit.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Circle, ListChecks, Loader2 } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import {
  usePlcActions,
  usePlcActivity,
  usePlcNotesData,
} from '@/context/usePlcContext';
import { isForeignMentionEvent } from '@/utils/plcActivity';
import { logError } from '@/utils/logError';
import { PlcActivityRow } from '@/components/plc/activity/PlcActivityFeed';
import { splitSinceYouWereHere } from '@/components/plc/activity/activityDescriptions';
import {
  selectMyActionItems,
  type ActionItemView,
  type DueBucket,
} from '@/components/plc/home/cards/yourActionItems';
import { TileEmpty, TileFrame } from './TileFrame';
import type { PlcHomeTileProps } from './tileTypes';

const COMPACT_ITEMS = 2;
const HERO_SINCE = 8;
const HERO_EARLIER = 4;

const BUCKET_TEXT: Record<DueBucket, string> = {
  overdue: 'text-brand-red-primary',
  today: 'text-amber-700',
  soon: 'text-slate-500',
  later: 'text-slate-500',
  none: 'text-slate-400',
};

function dueLabel(
  t: ReturnType<typeof useTranslation>['t'],
  view: ActionItemView,
  locale?: string
): string | null {
  const dueAt = view.item.dueAt ?? null;
  if (dueAt == null) return null;
  if (view.bucket === 'overdue') {
    return t('plcDashboard.home.actionItems.due.overdue', {
      defaultValue: 'Overdue',
    });
  }
  if (view.bucket === 'today') {
    return t('plcDashboard.home.actionItems.due.today', {
      defaultValue: 'Today',
    });
  }
  try {
    return new Date(dueAt).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

const ItemRow: React.FC<{ view: ActionItemView; plcId: string }> = ({
  view,
  plcId,
}) => {
  const { t, i18n } = useTranslation();
  const { addToast } = useDashboard();
  const { updateNote } = usePlcActions();
  const [busy, setBusy] = useState(false);
  const due = dueLabel(t, view, i18n.language);

  const markDone = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = (view.note.actionItems ?? []).map((ai) =>
        ai.id === view.item.id ? { ...ai, done: true, doneAt: Date.now() } : ai
      );
      await updateNote(
        view.note.id,
        { actionItems: next },
        { expectedVersion: view.note.version }
      );
    } catch (err) {
      logError('ActionsActivityTile.markDone', err, {
        plcId,
        noteId: view.note.id,
        itemId: view.item.id,
      });
      addToast(
        t('plcDashboard.home.actionItems.toggleFailed', {
          defaultValue: "Couldn't update that action item.",
        }),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <button
        type="button"
        onClick={() => void markDone()}
        disabled={busy}
        aria-label={t('plcDashboard.home.actionItems.markDoneNamed', {
          text: view.item.text,
          defaultValue: 'Mark "{{text}}" done',
        })}
        className="shrink-0 rounded-full text-slate-300 transition-colors hover:text-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Circle className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
        {view.item.text}
      </span>
      {due && (
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${BUCKET_TEXT[view.bucket]}`}
        >
          <CalendarClock className="h-3 w-3" aria-hidden="true" />
          {due}
        </span>
      )}
    </li>
  );
};

export const ActionsActivityTile: React.FC<PlcHomeTileProps> = ({
  ctx,
  hero,
  controls,
}) => {
  const { t } = useTranslation();
  const { data: notes, loading } = usePlcNotesData();
  const activity = usePlcActivity();

  const items = useMemo(
    () => selectMyActionItems(notes, ctx.uid, ctx.now),
    [notes, ctx.uid, ctx.now]
  );
  const { since, older } = useMemo(() => {
    const visible = activity.filter(
      (event) => !isForeignMentionEvent(event, ctx.uid)
    );
    return splitSinceYouWereHere(visible, ctx.lastSeenAt);
  }, [activity, ctx.uid, ctx.lastSeenAt]);

  const shownItems = hero ? items : items.slice(0, COMPACT_ITEMS);

  return (
    <TileFrame
      icon={ListChecks}
      title={t('plcDashboard.home.actionsActivity.title', {
        defaultValue: 'Action items and activity',
      })}
      hero={hero}
      headerExtra={controls}
      link={{
        label: t('plcDashboard.home.actionItems.openAll', {
          defaultValue: 'Open action items',
        }),
        onClick: () => ctx.onNavigate('docs'),
      }}
    >
      <div
        className={hero ? 'grid gap-5 lg:grid-cols-2' : 'flex flex-col gap-3'}
      >
        <div>
          <p className="text-xs font-semibold text-slate-500">
            {t('plcDashboard.home.actionItems.heading', {
              defaultValue: 'Your action items',
            })}
            {items.length > 0 && ` (${items.length})`}
          </p>
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-4 text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">
              {t('plcDashboard.home.actionItems.empty', {
                defaultValue: "You're all caught up",
              })}
            </p>
          ) : (
            <ul>
              {shownItems.map((view) => (
                <ItemRow key={view.item.id} view={view} plcId={ctx.plc.id} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">
            {since.length > 0
              ? t('plcDashboard.home.actionsActivity.newSince', {
                  count: since.length,
                  defaultValue: '{{count}} new since your last visit',
                })
              : t('plcDashboard.activity.caughtUpSubtitle', {
                  defaultValue: 'No new activity since your last visit.',
                })}
          </p>
          {hero && (
            <>
              {since.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {since.slice(0, HERO_SINCE).map((event) => (
                    <PlcActivityRow
                      key={event.id}
                      event={event}
                      selfUid={ctx.uid}
                    />
                  ))}
                </ul>
              )}
              {older.length > 0 && (
                <>
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    {t('plcDashboard.activity.olderHeading', {
                      defaultValue: 'Earlier',
                    })}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {older.slice(0, HERO_EARLIER).map((event) => (
                      <PlcActivityRow
                        key={event.id}
                        event={event}
                        selfUid={ctx.uid}
                      />
                    ))}
                  </ul>
                </>
              )}
              {since.length === 0 && older.length === 0 && (
                <TileEmpty>
                  {t('plcDashboard.home.actionsActivity.noActivity', {
                    defaultValue: 'No team activity yet.',
                  })}
                </TileEmpty>
              )}
            </>
          )}
        </div>
      </div>
    </TileFrame>
  );
};
