import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users2 } from 'lucide-react';
import { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';

interface MembersTileProps {
  plc: Plc;
}

function initialsFromEmail(email: string): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email.charAt(0).toUpperCase();
  if (parts.length === 1)
    return (parts[0]?.charAt(0) ?? '').toUpperCase() || '?';
  return (
    (parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')
  ).toUpperCase();
}

export const MembersTile: React.FC<MembersTileProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const members = useMemo(
    () =>
      plc.memberUids.map((uid) => ({
        uid,
        email: plc.memberEmails[uid] ?? '',
        isLead: uid === plc.leadUid,
        isYou: uid === user?.uid,
      })),
    [plc, user]
  );

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
          <Users2 className="w-3.5 h-3.5 text-brand-blue-primary" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.members.heading', {
            defaultValue: 'Members',
            count: members.length,
          })}
        </h4>
        <span className="ml-auto text-xs font-bold text-slate-700">
          {members.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 overflow-y-auto custom-scrollbar -m-0.5 p-0.5">
        {members.map((m) => (
          <div
            key={m.uid}
            className={`relative flex items-center justify-center w-9 h-9 rounded-full text-xxs font-bold shadow-sm border ${
              m.isYou
                ? 'bg-brand-blue-primary text-white border-brand-blue-dark'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
            title={`${m.email}${m.isLead ? ' (lead)' : ''}${m.isYou ? ' (you)' : ''}`}
          >
            {initialsFromEmail(m.email)}
            {m.isLead && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red-primary border border-white" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
