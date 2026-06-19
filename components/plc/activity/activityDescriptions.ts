/**
 * Pure helpers for the PLC activity feed (T8). Split out of PlcActivityFeed.tsx
 * so that file only exports React components (keeps react-refresh happy) and so
 * the description / split / relative-time logic is unit-testable in isolation
 * (mirrors the T4 `notesTemplate.ts` / T5 `mentionUtils.ts` precedent).
 */

import type { ComponentType } from 'react';
import type { TFunction } from 'i18next';
import {
  UserPlus,
  UserMinus,
  Shield,
  FilePlus2,
  Share2,
  BarChart3,
  Users,
  StickyNote,
  MessageSquare,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import type { PlcActivityEvent, PlcActivityType } from '@/types';
import { MENTION_ACTIVITY_TARGET_TYPE } from '@/hooks/usePlcComments';

/** Per-type icon + Tailwind text color for the leading glyph. */
export const EVENT_VISUALS: Record<
  PlcActivityType,
  { Icon: ComponentType<{ className?: string }>; color: string }
> = {
  member_joined: { Icon: UserPlus, color: 'text-emerald-600' },
  member_left: { Icon: UserMinus, color: 'text-slate-500' },
  role_changed: { Icon: Shield, color: 'text-brand-blue-primary' },
  assessment_created: { Icon: FilePlus2, color: 'text-brand-blue-primary' },
  assessment_shared: { Icon: Share2, color: 'text-brand-blue-primary' },
  assessment_results_ready: { Icon: BarChart3, color: 'text-amber-600' },
  meeting_held: { Icon: Users, color: 'text-brand-blue-primary' },
  note_created: { Icon: StickyNote, color: 'text-amber-600' },
  comment_added: { Icon: MessageSquare, color: 'text-brand-blue-primary' },
  item_deleted: { Icon: Trash2, color: 'text-brand-red-primary' },
  item_restored: { Icon: RotateCcw, color: 'text-emerald-600' },
};

/**
 * English fallback templates, one per `PlcActivityType`, kept in lockstep with
 * `plcDashboard.activity.event.*` in locales/en.json. Passed as the `t`
 * `defaultValue` so the description is correct even before the namespace loads
 * (and so unit tests that stub `t` to echo `defaultValue` still read real copy).
 */
export const EVENT_DEFAULTS: Record<PlcActivityType, string> = {
  member_joined: '{{actor}} joined the PLC',
  member_left: '{{actor}} left the PLC',
  role_changed: '{{actor}} changed {{target}}’s role',
  assessment_created: '{{actor}} created {{target}}',
  assessment_shared: '{{actor}} shared {{target}}',
  assessment_results_ready: 'Results are ready for {{target}}',
  meeting_held: '{{actor}} held a meeting',
  note_created: '{{actor}} added a note: {{target}}',
  comment_added: '{{actor}} commented on {{target}}',
  item_deleted: '{{actor}} deleted {{target}}',
  item_restored: '{{actor}} restored {{target}}',
};

/**
 * Is this event a `comment_added` that @mentions `selfUid`? Mentions ride on the
 * schema-locked activity doc via the T5 sentinel: `targetType` is the mention
 * marker and `targetId` is the mentioned uid (see usePlcComments).
 */
export function isMentionOfSelf(
  event: PlcActivityEvent,
  selfUid: string | null
): boolean {
  return (
    !!selfUid &&
    event.type === 'comment_added' &&
    event.targetType === MENTION_ACTIVITY_TARGET_TYPE &&
    event.targetId === selfUid
  );
}

/**
 * Build the human-readable description for one event. Pure + i18n'd: every
 * `PlcActivityType` resolves to `plcDashboard.activity.event.<type>` with the
 * actor name and (when present) the target title woven in. A `comment_added`
 * event that @mentions the current user gets the dedicated "mentioned you" copy.
 * Missing actor/target fall back to translated placeholders so the line never
 * renders a raw uid or an empty span.
 */
export function describeActivityEvent(
  event: PlcActivityEvent,
  t: TFunction,
  selfUid: string | null
): string {
  const actor =
    event.actorName.trim() ||
    t('plcDashboard.activity.unknownActor', { defaultValue: 'Someone' });

  if (isMentionOfSelf(event, selfUid)) {
    return t('plcDashboard.activity.youMentioned', {
      actor,
      defaultValue: '{{actor}} mentioned you in a comment',
    });
  }

  // For the mention-fan-out duplicate of a comment that is NOT for self, the
  // targetTitle carries a thread id — prefer the translated placeholder over a
  // raw id.
  const untitled = t('plcDashboard.activity.untitled', {
    defaultValue: 'an item',
  });
  const target =
    event.targetType === MENTION_ACTIVITY_TARGET_TYPE
      ? untitled
      : event.targetTitle?.trim()
        ? event.targetTitle.trim()
        : untitled;

  return t(`plcDashboard.activity.event.${event.type}`, {
    actor,
    target,
    defaultValue: EVENT_DEFAULTS[event.type],
  });
}

/**
 * Locale-correct relative time ("2 min ago", "yesterday"). Truncates to the
 * largest crossed unit (Math.floor) so we never overstate staleness. A pending/
 * unresolved timestamp (`createdAt <= 0`) or a future time resolves to "Just
 * now". Reads `t` for the "just now" string (the rest comes from
 * `Intl.RelativeTimeFormat`, which is already localized by the active language).
 */
export function formatActivityRelativeTime(
  createdAt: number,
  t: TFunction,
  now: number = Date.now()
): string {
  const justNow = t('plcDashboard.activity.justNow', {
    defaultValue: 'Just now',
  });
  if (createdAt <= 0) return justNow;
  const diffMs = now - createdAt;
  if (diffMs < 60_000) return justNow;
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return fmt.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fmt.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return fmt.format(-days, 'day');
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return fmt.format(-weeks, 'week');
  const months = Math.floor(days / 30);
  if (months < 12) return fmt.format(-months, 'month');
  return fmt.format(-Math.floor(days / 365), 'year');
}

/**
 * Split a newest-first activity list into events newer than `lastSeenAt`
 * ("since you were here") and the rest ("earlier"). Pure so the card + test
 * share it. `lastSeenAt == null` (never visited) puts everything in `since`.
 * Strict `>` so an event written exactly at the cursor counts as already seen
 * (mirrors `deriveUnreadCount`).
 */
export function splitSinceYouWereHere(
  activity: readonly PlcActivityEvent[],
  lastSeenAt: number | null
): { since: PlcActivityEvent[]; older: PlcActivityEvent[] } {
  const since: PlcActivityEvent[] = [];
  const older: PlcActivityEvent[] = [];
  for (const event of activity) {
    if (lastSeenAt == null || event.createdAt > lastSeenAt) {
      since.push(event);
    } else {
      older.push(event);
    }
  }
  return { since, older };
}
