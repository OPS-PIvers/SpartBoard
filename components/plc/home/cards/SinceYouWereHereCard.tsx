/**
 * SinceYouWereHereCard — the Home "since you were here" digest (PRD §4.1 / §6.3,
 * Decision 2.2).
 *
 * Given the PLC's activity feed and the member's `lastSeenAt` cursor, it splits
 * events into:
 *   - "Since you were here" — events with `createdAt > lastSeenAt`, surfaced
 *     prominently at the top, and
 *   - "Earlier" — the rest, shown muted beneath (capped).
 *
 * @mention-of-self events are visually distinguished by the shared
 * `PlcActivityRow` (accent ring + "Mentioned you" badge).
 *
 * NOTE: this card is presentational — it does NOT call `markSeen()`. The Home
 * page owns the single `usePlcUnread` instance and calls `markSeen()` on mount
 * (the legitimate external-sync use of useEffect) so the sidebar badge clears;
 * it passes the cursor + activity down here. Keeping the cursor read in one place
 * avoids two `plc_state` listeners and a render-time setState loop.
 *
 * Light-surface modal chrome (Home page) — normal Tailwind sizing, no cqmin.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { History, CheckCircle2 } from 'lucide-react';
import type { Plc, PlcActivityEvent } from '@/types';
import { useAuth } from '@/context/useAuth';
import { isForeignMentionEvent } from '@/utils/plcActivity';
import { PlcActivityRow } from '@/components/plc/activity/PlcActivityFeed';
import { splitSinceYouWereHere } from '@/components/plc/activity/activityDescriptions';

interface SinceYouWereHereCardProps {
  /** The PLC whose digest to render. Reserved for future per-PLC styling. */
  plc: Plc;
  /** The PLC's activity feed (newest-first) — passed from Home's usePlcUnread. */
  activity: readonly PlcActivityEvent[];
  /** The member's last-seen cursor (ms), or null if they have never visited. */
  lastSeenAt: number | null;
}

/** Cap on each bucket so the digest stays glanceable. */
const SINCE_LIMIT = 8;
const OLDER_LIMIT = 4;

export const SinceYouWereHereCard: React.FC<SinceYouWereHereCardProps> = ({
  activity,
  lastSeenAt,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const selfUid = user?.uid ?? null;

  // Drop per-mention events addressed to OTHER members before bucketing
  // (Decision 2.3): they are private notifications and would duplicate the
  // general comment row + inflate the "N new" count for everyone. A mention
  // addressed to me stays (rendered with the "Mentioned you" treatment).
  const { since, older } = useMemo(() => {
    const visible = activity.filter(
      (event) => !isForeignMentionEvent(event, selfUid)
    );
    return splitSinceYouWereHere(visible, lastSeenAt);
  }, [activity, lastSeenAt, selfUid]);

  const visibleSince = useMemo(() => since.slice(0, SINCE_LIMIT), [since]);
  const visibleOlder = useMemo(() => older.slice(0, OLDER_LIMIT), [older]);

  const hasSince = visibleSince.length > 0;

  return (
    <div className="flex flex-col bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <div className="w-8 h-8 rounded-xl bg-brand-blue-lighter/60 flex items-center justify-center shrink-0">
          <History
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
        </div>
        <h3 className="flex-1 text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.activity.sinceLastVisit', {
            defaultValue: 'Since you were here',
          })}
        </h3>
        {hasSince && (
          <span className="rounded-full bg-brand-red-primary px-2 py-0.5 text-xs font-bold text-white">
            {t('plcDashboard.activity.unreadBadge', {
              count: since.length,
              defaultValue: '{{count}} new',
            })}
          </span>
        )}
      </div>

      <div className="flex-1 px-4 pb-4">
        {hasSince ? (
          <>
            <p className="px-3 pb-1 text-xs text-slate-400">
              {t('plcDashboard.activity.sinceSubtitle', {
                defaultValue: 'What happened while you were away',
              })}
            </p>
            <ul
              className="space-y-0.5"
              aria-label={t('plcDashboard.activity.sinceLastVisit', {
                defaultValue: 'Since you were here',
              })}
            >
              {visibleSince.map((event) => (
                <PlcActivityRow
                  key={event.id}
                  event={event}
                  selfUid={selfUid}
                />
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2
              className="w-8 h-8 text-emerald-300 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-500">
              {t('plcDashboard.activity.caughtUp', {
                defaultValue: 'You’re all caught up',
              })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('plcDashboard.activity.caughtUpSubtitle', {
                defaultValue: 'No new activity since your last visit.',
              })}
            </p>
          </div>
        )}

        {/* Earlier activity — only meaningful alongside fresh events; when
            caught up the standalone PlcActivityFeed card carries the full log. */}
        {hasSince && visibleOlder.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('plcDashboard.activity.olderHeading', {
                defaultValue: 'Earlier',
              })}
            </p>
            <ul className="space-y-0.5 opacity-75">
              {visibleOlder.map((event) => (
                <PlcActivityRow
                  key={event.id}
                  event={event}
                  selfUid={selfUid}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
