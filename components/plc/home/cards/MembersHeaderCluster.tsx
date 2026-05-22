/**
 * MembersHeaderCluster — compact members display for the Home page header:
 * a "Members (n)" label over a row of overlapping avatar initials. The whole
 * cluster is a button that navigates to the Members section.
 *
 * Data comes directly from the Plc prop (no additional hook needed —
 * memberUids + memberEmails are already present on the Plc document).
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import type { Plc } from '@/types';
import type { PlcSectionId } from '../../sections';

interface MembersHeaderClusterProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

/** Generate 1-2 uppercase initials from an email address. */
function initialsFromEmail(email: string): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return (email.charAt(0) ?? '?').toUpperCase();
  if (parts.length === 1) return (parts[0]?.charAt(0) ?? '?').toUpperCase();
  return (
    (parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')
  ).toUpperCase();
}

const MAX_VISIBLE = 6;

export const MembersHeaderCluster: React.FC<MembersHeaderClusterProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();

  const members = useMemo(
    () =>
      plc.memberUids.map((uid) => ({
        uid,
        email: plc.memberEmails[uid] ?? '',
        isLead: uid === plc.leadUid,
      })),
    [plc]
  );

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - MAX_VISIBLE;

  return (
    <button
      type="button"
      onClick={() => onNavigate('members')}
      aria-label={t('plcDashboard.home.members.manageAriaLabel', {
        defaultValue: 'Manage members',
      })}
      className="group flex flex-col items-end gap-1.5 rounded-xl px-2 py-1 transition-colors hover:bg-slate-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
    >
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {t('plcDashboard.home.members.headingWithCount', {
          count: members.length,
          defaultValue: `Members (${members.length})`,
        })}
      </span>
      <div
        className="flex items-center -space-x-2"
        role="list"
        aria-label={t('plcDashboard.home.members.listAriaLabel', {
          defaultValue: 'PLC members',
        })}
      >
        {visible.map((m) => {
          const ariaLabel = `${m.email || m.uid}${m.isLead ? ', lead' : ''}`;
          return (
            <div
              key={m.uid}
              role="img"
              aria-label={ariaLabel}
              title={`${m.email}${m.isLead ? ' (lead)' : ''}`}
              className={`relative flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shadow-sm ring-2 ring-white ${
                m.isLead
                  ? 'bg-brand-blue-primary text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <span aria-hidden="true">{initialsFromEmail(m.email)}</span>
              {m.isLead && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-red-primary border-2 border-white flex items-center justify-center"
                >
                  <Crown className="w-1.5 h-1.5 text-white" />
                </span>
              )}
            </div>
          );
        })}
        {overflow > 0 && (
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 ring-2 ring-white text-xs font-bold text-slate-500"
            aria-label={t('plcDashboard.home.members.overflow', {
              count: overflow,
              defaultValue: `+${overflow} more`,
            })}
            title={`+${overflow} more`}
          >
            +{overflow}
          </div>
        )}
      </div>
    </button>
  );
};
