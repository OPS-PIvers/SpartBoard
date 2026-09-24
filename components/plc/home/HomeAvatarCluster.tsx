// PLC Home v2 header avatars: one cluster, online members ringed and labeled with their section.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlcMembers, usePlcWhoIsHere } from '@/context/usePlcContext';
import type { PlcSectionId } from '@/components/plc/sections';

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
  meeting: 'the meeting',
};

function initials(name: string): string {
  const base = name.includes('@') ? (name.split('@')[0] ?? '') : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.charAt(0) ?? '?').toUpperCase();
  return (
    (parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')
  ).toUpperCase();
}

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
    <button
      type="button"
      onClick={onOpenMembers}
      aria-label={t('plcDashboard.home.members.clusterAriaLabel', {
        count: people.length,
        online: onlineCount,
        defaultValue: '{{count}} members, {{online}} online. Open Members',
      })}
      className="flex items-center -space-x-2 rounded-full p-1 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
    >
      {visible.map((p) => {
        const where = p.section
          ? t('plcDashboard.home.members.onlineIn', {
              name: p.name,
              section: t(`plcDashboard.presence.section.${p.section}`, {
                defaultValue: SECTION_LABELS[p.section],
              }),
              defaultValue: '{{name}}, online in {{section}}',
            })
          : p.name;
        return (
          <span
            key={p.uid}
            title={where}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-2 ${
              p.section ? 'ring-emerald-500' : 'ring-white'
            }`}
          >
            <span aria-hidden="true">{initials(p.name)}</span>
          </span>
        );
      })}
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
};
