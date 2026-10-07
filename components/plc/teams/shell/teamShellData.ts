// Pure selectors for the team header: avatars, member rows and the live meeting banner line.

import type { TFunction } from 'i18next';
import type { PlcMeeting, PlcMember, PlcNote, PlcRole } from '@/types';
import type { PlcPresenceEntry } from '@/context/usePlcContext';
import type { HomeAvatarPerson } from '@/components/plc/home/HomeAvatarCluster';
import type { TeamMemberRow } from './TeamHeaderPanels';

const ROLE_ORDER: Record<PlcRole, number> = {
  lead: 0,
  coLead: 1,
  member: 2,
  viewer: 3,
};

export function memberName(m: PlcMember): string {
  return m.displayName?.trim() || m.email || m.uid;
}

export function roleLabel(t: TFunction, role: PlcRole): string {
  switch (role) {
    case 'lead':
      return t('plcDashboard.members.roles.lead', { defaultValue: 'Lead' });
    case 'coLead':
      return t('plcDashboard.members.roles.coLead', {
        defaultValue: 'Co-lead',
      });
    case 'viewer':
      return t('plcDashboard.members.roles.viewer', {
        defaultValue: 'Viewer',
      });
    default:
      return t('plcDashboard.members.roles.member', {
        defaultValue: 'Member',
      });
  }
}

/** Members by role then name, with who is here now. */
export function selectMemberRows(
  t: TFunction,
  members: readonly PlcMember[],
  here: readonly PlcPresenceEntry[]
): TeamMemberRow[] {
  const online = new Set(here.map((p) => p.uid));
  return [...members]
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        memberName(a).localeCompare(memberName(b))
    )
    .map((m) => ({
      id: m.uid,
      name: memberName(m),
      roleLabel: roleLabel(t, m.role),
      online: online.has(m.uid),
    }));
}

/** Header avatars in roster order. */
export function selectAvatarPeople(
  t: TFunction,
  rows: readonly TeamMemberRow[]
): HomeAvatarPerson[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    online: r.online,
    title: r.online
      ? t('teams.members.nameHereNow', {
          name: r.name,
          defaultValue: '{{name}}, here now',
        })
      : r.name,
  }));
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

/** "PLC meeting Oct 9 · started 3:16 PM · 3 here" */
export function meetingBannerMeta(
  t: TFunction,
  meeting: PlcMeeting,
  notes: readonly PlcNote[],
  here: readonly PlcPresenceEntry[]
): string {
  const note = notes.find(
    (n) => n.meetingId === meeting.id && n.deletedAt == null
  );
  const noteTitle = note?.title.trim() ?? '';
  const title =
    noteTitle.length > 0
      ? noteTitle
      : t('teams.meeting.recordTitle', {
          date: dateFmt.format(meeting.heldAt),
          defaultValue: 'Meeting record {{date}}',
        });
  const inMeeting = here.filter((p) => p.section === 'meeting').length;
  const parts = [
    title,
    t('teams.meeting.started', {
      time: timeFmt.format(meeting.heldAt),
      defaultValue: 'started {{time}}',
    }),
  ];
  if (inMeeting > 0) {
    parts.push(
      t('teams.meeting.here', {
        count: inMeeting,
        defaultValue: '{{count}} here',
      })
    );
  }
  return parts.join(' · ');
}

export function formatShortDate(ms: number): string {
  return dateFmt.format(ms);
}
