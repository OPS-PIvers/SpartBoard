/**
 * Per-widget daily and monthly users for Admin Settings > Analytics > Widgets.
 *
 * The client stamps `lastUse: { uid, at }` on a widget the first time its
 * owner clicks, taps or types in it each day. The nightly recompute counts
 * owners by that stamp and keeps one counts-only doc per day at
 * `/organizations/{orgId}/analytics_widget_days/{YYYY-MM-DD}` so the table
 * can show the change from the day before and from 30 days before.
 */

import * as admin from 'firebase-admin';
import { chicagoDateKey } from './adminAnalyticsHistory';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
// Drill-down rows per widget, and across all widgets, so the snapshot doc stays well under 1 MiB.
export const MAX_WIDGET_USER_ROWS = 500;
export const MAX_TOTAL_USER_ROWS = 6000;

/** Splits the row budget so small widgets keep every row and big ones share the rest evenly. */
export function rowAllowance(sizes: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let left = MAX_TOTAL_USER_ROWS;
  const ordered = [...sizes].sort(([, a], [, b]) => a - b);
  ordered.forEach(([type, size], i) => {
    const fair = Math.floor(left / (ordered.length - i));
    const take = Math.min(size, MAX_WIDGET_USER_ROWS, fair);
    out.set(type, take);
    left -= take;
  });
  return out;
}

export interface WidgetUserRow {
  email: string;
  // 0 when the teacher has the widget but has not used it since tracking began.
  lastUsedMs: number;
}

export interface WidgetUsage {
  daily: number;
  monthly: number;
  // null until there is a saved day to compare with.
  dailyPrev: number | null;
  monthlyPrev: number | null;
  // Teachers with the widget on a board, by member building id ('none' when unassigned).
  buildings: Record<string, number>;
  users: WidgetUserRow[];
}

export type WidgetDayCounts = Record<
  string,
  { daily: number; monthly: number }
>;

export interface WidgetUsageMember {
  email: string;
  buildingIds: string[];
}

/** Accumulates widget owners and their latest own-use stamp while the dashboards stream. */
export class WidgetUsageTracker {
  private owners = new Map<string, Map<string, number>>();

  add(type: string, ownerUid: string, lastUse: unknown): void {
    let byUid = this.owners.get(type);
    if (!byUid) {
      byUid = new Map();
      this.owners.set(type, byUid);
    }
    const prev = byUid.get(ownerUid) ?? 0;
    byUid.set(ownerUid, Math.max(prev, ownUseMs(lastUse, ownerUid)));
  }

  build(input: {
    now: number;
    // `YYYY-MM-DD` district day being measured; any use on or after it counts as daily.
    day: string;
    members: Map<string, WidgetUsageMember>;
    prevDay?: WidgetDayCounts | null;
    monthAgo?: WidgetDayCounts | null;
  }): Record<string, WidgetUsage> {
    const { now, members } = input;
    const out: Record<string, WidgetUsage> = {};
    const allowance = rowAllowance(
      new Map([...this.owners].map(([type, byUid]) => [type, byUid.size]))
    );
    for (const [type, byUid] of this.owners) {
      let daily = 0;
      let monthly = 0;
      const buildings: Record<string, number> = {};
      const users: WidgetUserRow[] = [];
      for (const [uid, stamped] of byUid) {
        // A stamp from a client clock far ahead of ours is not a real use.
        const at = stamped > now + DAY_MS ? 0 : stamped;
        const age = now - at;
        if (at > 0 && age <= DAY_MS && chicagoDateKey(at) >= input.day) {
          daily += 1;
        }
        if (at > 0 && age <= MONTH_MS) monthly += 1;
        const member = members.get(uid);
        const ids =
          member && member.buildingIds.length > 0
            ? new Set(member.buildingIds)
            : ['none'];
        for (const id of ids) buildings[id] = (buildings[id] ?? 0) + 1;
        users.push({
          email: member?.email ?? `Unknown (${uid})`,
          lastUsedMs: at,
        });
      }
      users.sort(
        (a, b) => b.lastUsedMs - a.lastUsedMs || a.email.localeCompare(b.email)
      );
      out[type] = {
        daily,
        monthly,
        dailyPrev: input.prevDay ? (input.prevDay[type]?.daily ?? 0) : null,
        monthlyPrev: input.monthAgo
          ? (input.monthAgo[type]?.monthly ?? 0)
          : null,
        buildings,
        users: users.slice(0, allowance.get(type) ?? 0),
      };
    }
    return out;
  }
}

/** The stamp's time, counted only when the board owner made it, so a copied board brings no use with it. */
export function ownUseMs(lastUse: unknown, ownerUid: string): number {
  if (!lastUse || typeof lastUse !== 'object') return 0;
  const { uid, at } = lastUse as { uid?: unknown; at?: unknown };
  if (uid !== ownerUid) return 0;
  return typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : 0;
}

export function widgetDayCounts(
  usage: Record<string, WidgetUsage>
): WidgetDayCounts {
  const out: WidgetDayCounts = {};
  for (const [type, u] of Object.entries(usage)) {
    out[type] = { daily: u.daily, monthly: u.monthly };
  }
  return out;
}

const dayPath = (orgId: string, date: string) =>
  `organizations/${orgId}/analytics_widget_days/${date}`;

export async function readWidgetDay(
  orgId: string,
  date: string
): Promise<WidgetDayCounts | null> {
  const snap = await admin.firestore().doc(dayPath(orgId, date)).get();
  if (!snap.exists) return null;
  const counts = (snap.data() as { counts?: unknown } | undefined)?.counts;
  return counts && typeof counts === 'object'
    ? (counts as WidgetDayCounts)
    : null;
}

export async function writeWidgetDay(
  orgId: string,
  date: string,
  counts: WidgetDayCounts
): Promise<void> {
  await admin.firestore().doc(dayPath(orgId, date)).set({ date, counts });
}
