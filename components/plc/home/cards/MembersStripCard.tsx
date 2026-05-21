/**
 * MembersStripCard — vertical "people" card: a header (icon + count), a
 * wrapping cluster of member avatars (initials), and a full-width "Manage"
 * button that navigates to the Members section. Sized to sit in the Home
 * sidebar column.
 *
 * Data comes directly from the Plc prop (no additional hook needed —
 * memberUids + memberEmails are already present on the Plc document).
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users2, Crown } from 'lucide-react';
import type { Plc } from '@/types';
import type { PlcSectionId } from '../../sections';

interface MembersStripCardProps {
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

const MAX_VISIBLE = 8;

export const MembersStripCard: React.FC<MembersStripCardProps> = ({
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
    <div className="flex flex-col gap-4 bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm px-5 py-4">
      {/* Header: icon + heading + count */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-brand-blue-lighter flex items-center justify-center shrink-0">
          <Users2
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 leading-none mb-0.5">
            {t('plcDashboard.home.members.heading', {
              defaultValue: 'Members',
            })}
          </p>
          <p className="text-xs text-slate-400">
            {t('plcDashboard.home.members.count', {
              count: members.length,
              defaultValue: `${members.length}`,
            })}
          </p>
        </div>
      </div>

      {/* Avatars */}
      <div
        className="flex items-center flex-wrap gap-1.5"
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
              className={`relative flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold shadow-sm border ${
                m.isLead
                  ? 'bg-brand-blue-primary text-white border-brand-blue-dark'
                  : 'bg-white text-slate-600 border-slate-200'
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
            className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500"
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

      {/* Manage button — full width */}
      <button
        type="button"
        onClick={() => onNavigate('members')}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        aria-label={t('plcDashboard.home.members.manageAriaLabel', {
          defaultValue: 'Manage members',
        })}
      >
        {t('plcDashboard.home.members.manage', { defaultValue: 'Manage' })}
      </button>
    </div>
  );
};
