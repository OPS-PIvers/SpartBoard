import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { RosterGroup, RosterGroupAlert } from '@/types';
import { viewAsDirectSave } from '@/utils/viewAsAudit';

export const GROUP_EMAIL_ALERTS = 'group_email_alerts';

/** Server-readable copy of a group's emailed alerts; groups themselves live in Drive. */
export interface GroupEmailAlertDoc {
  rosterId: string;
  groupId: string;
  groupName: string;
  days: number[];
  alerts: RosterGroupAlert[];
  repeat: 'weekly' | 'biweekly';
  startDate: string;
  timeZone: string;
  message: string;
  updatedAt: number;
}

export const groupEmailAlertId = (rosterId: string, groupId: string) =>
  `${rosterId}_${groupId}`;

/** Docs for every group with an enabled reminder that also emails; never carries students. */
export function buildGroupEmailAlertDocs(
  rosterId: string,
  groups: RosterGroup[],
  timeZone: string,
  now: number
): GroupEmailAlertDoc[] {
  return groups.flatMap((g) => {
    const r = g.reminder;
    if (!r?.enabled || !r.emailAlert || r.days.length === 0) return [];
    return [
      {
        rosterId,
        groupId: g.id,
        groupName: g.name.trim().slice(0, 80),
        days: r.days,
        alerts: r.alerts,
        repeat: r.repeat,
        startDate: r.startDate,
        timeZone,
        message: r.emailMessage.trim(),
        updatedAt: now,
      },
    ];
  });
}

/** Rewrites this roster's email alert docs to match its groups; best effort. */
export async function syncGroupEmailAlerts(
  uid: string,
  rosterId: string,
  groups: RosterGroup[]
): Promise<void> {
  const col = collection(db, 'users', uid, GROUP_EMAIL_ALERTS);
  const existing = await getDocs(query(col, where('rosterId', '==', rosterId)));
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const wanted = buildGroupEmailAlertDocs(
    rosterId,
    groups,
    timeZone,
    Date.now()
  );
  const wantedIds = new Set(
    wanted.map((d) => groupEmailAlertId(d.rosterId, d.groupId))
  );
  await Promise.all([
    ...existing.docs
      .filter((d) => !wantedIds.has(d.id))
      .map((d) => viewAsDirectSave(d.ref, null, () => deleteDoc(d.ref))),
    ...wanted.map((data) => {
      const ref = doc(col, groupEmailAlertId(data.rosterId, data.groupId));
      return viewAsDirectSave(ref, null, () => setDoc(ref, data));
    }),
  ]);
}
