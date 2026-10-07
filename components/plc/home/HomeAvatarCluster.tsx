// PLC Home v2 header avatars: one cluster, online members ringed and labeled with their section.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlcMembers, usePlcWhoIsHere } from '@/context/usePlcContext';
import type { PlcSectionId } from '@/components/plc/sections';
import { initials } from './avatarInitials';

const MAX_VISIBLE = 6;

const SECTION_LABELS: Record<PlcSectionId | 'meeting', string> = {
  home: 'Home',
  assessments: 'Assessments',
  targets: 'Learning Targets',
  docs: 'Notes & Docs',
  sharedBoards: 'Boards',
  members: 'Members',
  resources: 'Resources',
  settings: 'Settings',
  updates: 'Updates',
  workspace: 'Workspace',
  meeting: 'the meeting',
};

export const HomeAvatarCluster: React.FC<{
  onOpenMembers: () => void;
}> = ({ onOpenMembers }) => {
  const { t } = useTranslation();
  const members = usePlcMembers();
  const whoIsHere = usePlcWhoIsHere();

  const people = useMemo(() => {
    const sectionByUid = new Map<string, PlcSectionId | 'meeting'>();
    for (const entry of whoIsHere) {
      if (!sectionByUid.has(entry.uid))
        sectionByUid.set(entry.uid, entry.section);
    }
    return members
      .map((m) => ({
        uid: m.uid,
        name: m.displayName?.trim() || m.email || m.uid,
        section: sectionByUid.get(m.uid) ?? null,
      }))
      .sort((a, b) => Number(b.section !== null) - Number(a.section !== null));
  }, [members, whoIsHere]);

  const visible = people.slice(0, MAX_VISIBLE);
  const overflow = people.length - visible.length;
  const onlineCount = people.filter((p) => p.section !== null).length;

  return (
    <HomeAvatarStack
      people={visible.map((p) => ({
        id: p.uid,
        name: p.name,
        online: p.section !== null,
        title: p.section
          ? t('plcDashboard.home.members.onlineIn', {
              name: p.name,
              section: t(`plcDashboard.presence.section.${p.section}`, {
                defaultValue: SECTION_LABELS[p.section],
              }),
              defaultValue: '{{name}}, online in {{section}}',
            })
          : p.name,
      }))}
      overflow={overflow}
      onClick={onOpenMembers}
      ariaLabel={t('plcDashboard.home.members.clusterAriaLabel', {
        count: people.length,
        online: onlineCount,
        defaultValue: '{{count}} members, {{online}} online. Open Members',
      })}
    />
  );
};

export interface HomeAvatarPerson {
  id: string;
  name: string;
  online: boolean;
  title: string;
}

/** Presentational avatar stack; online members get the emerald ring. */
export const HomeAvatarStack: React.FC<{
  people: HomeAvatarPerson[];
  overflow: number;
  onClick: () => void;
  ariaLabel: string;
  expanded?: boolean;
}> = ({ people, overflow, onClick, ariaLabel, expanded }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    aria-expanded={expanded}
    className="flex items-center -space-x-2 rounded-full p-1 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
  >
    {people.map((p) => (
      <span
        key={p.id}
        title={p.title}
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-2 ${
          p.online ? 'ring-emerald-500' : 'ring-white'
        }`}
      >
        <span aria-hidden="true">{initials(p.name)}</span>
      </span>
    ))}
    {overflow > 0 && (
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500 ring-2 ring-white"
      >
        +{overflow}
      </span>
    )}
  </button>
);
