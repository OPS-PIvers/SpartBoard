/**
 * PlcActivityFeed — the human-readable PLC activity log (Decision 2.2, §3.4).
 *
 * Renders the live activity slice (`usePlcActivity()`, T3) as a vertical feed of
 * events with:
 *   - an i18n'd, per-`PlcActivityType` description (actor + target woven in),
 *   - a per-type icon + accent color,
 *   - the actor's relative timestamp (`Intl.RelativeTimeFormat`, locale-correct),
 *   - and a distinguishing treatment for `comment_added` events that
 *     @mention the CURRENT user.
 *
 * This is modal chrome on a LIGHT surface (the Home page), so it uses normal
 * Tailwind sizing — no cqmin units (those are for widget front-faces only).
 *
 * Pure description / split / relative-time logic lives in
 * `./activityDescriptions` so this file only exports React components.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AtSign, Activity as ActivityIcon } from 'lucide-react';
import type { Plc, PlcActivityEvent } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcActivity } from '@/context/usePlcContext';
import { isForeignMentionEvent } from '@/utils/plcActivity';
import {
  EVENT_VISUALS,
  describeActivityEvent,
  formatActivityRelativeTime,
  isMentionOfSelf,
} from './activityDescriptions';

interface PlcActivityFeedProps {
  /** The PLC whose activity to render. Reserved for future per-PLC styling. */
  plc: Plc;
  /** Cap the number of rendered events (newest-first). Defaults to 8. */
  limit?: number;
}

/**
 * A single feed row. Exported so SinceYouWereHereCard renders identical rows.
 * `isMentionOfSelf` draws the @mention-of-self distinction (accent ring + a
 * badge), independent of the since/older bucket it lives in.
 */
export const PlcActivityRow: React.FC<{
  event: PlcActivityEvent;
  selfUid: string | null;
}> = ({ event, selfUid }) => {
  const { t } = useTranslation();
  const mention = isMentionOfSelf(event, selfUid);
  const visuals = EVENT_VISUALS[event.type];
  const Icon = mention ? AtSign : (visuals?.Icon ?? ActivityIcon);
  const iconColor = mention
    ? 'text-brand-red-primary'
    : (visuals?.color ?? 'text-slate-500');
  const description = describeActivityEvent(event, t, selfUid);
  const when = formatActivityRelativeTime(event.createdAt, t);

  return (
    <li
      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        mention
          ? 'bg-brand-red-primary/5 ring-1 ring-inset ring-brand-red-primary/20'
          : 'hover:bg-slate-50'
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${iconColor}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-slate-700">{description}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <time className="text-xs text-slate-400">{when}</time>
          {mention && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-red-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-red-primary">
              <AtSign className="h-2.5 w-2.5" aria-hidden="true" />
              {t('plcDashboard.activity.mentionBadge', {
                defaultValue: 'Mentioned you',
              })}
            </span>
          )}
        </div>
      </div>
    </li>
  );
};

/**
 * Standalone "Recent activity" feed card (Home sidebar / anywhere a bounded
 * activity list should surface). Pulls the provider slice + current uid and
 * renders the latest `limit` events newest-first.
 */
export const PlcActivityFeed: React.FC<PlcActivityFeedProps> = ({
  limit = 8,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const selfUid = user?.uid ?? null;
  const activity = usePlcActivity();

  // Per-mention events are PRIVATE notifications for the mentioned member — a
  // comment with N mentions writes N+1 events, and rendering the mention rows
  // for everyone duplicates the general row N times (Decision 2.3, "no per-event
  // spam"). Drop mention events addressed to OTHER members; a mention addressed
  // to me stays (PlcActivityRow gives it the "Mentioned you" treatment). The
  // general comment row is unaffected.
  const visible = useMemo(
    () =>
      activity
        .filter((event) => !isForeignMentionEvent(event, selfUid))
        .slice(0, limit),
    [activity, limit, selfUid]
  );

  return (
    <div className="flex flex-col bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <div className="w-8 h-8 rounded-xl bg-brand-blue-lighter/60 flex items-center justify-center shrink-0">
          <ActivityIcon
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
        </div>
        <h3 className="flex-1 text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.activity.feedHeading', {
            defaultValue: 'Recent activity',
          })}
        </h3>
      </div>

      <div className="flex-1 px-4 pb-4">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <ActivityIcon
              className="w-8 h-8 text-slate-200 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-500">
              {t('plcDashboard.activity.empty', {
                defaultValue: 'No activity yet',
              })}
            </p>
          </div>
        ) : (
          <ul
            className="space-y-0.5"
            aria-label={t('plcDashboard.activity.feedAria', {
              defaultValue: 'Recent PLC activity',
            })}
          >
            {visible.map((event) => (
              <PlcActivityRow key={event.id} event={event} selfUid={selfUid} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
