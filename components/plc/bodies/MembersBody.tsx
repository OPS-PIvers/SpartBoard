import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Crown,
  Mail,
  Plus,
  UserMinus,
  UserPlus,
  Users2,
  X,
} from 'lucide-react';
import { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { logError } from '@/utils/logError';

interface MembersBodyProps {
  plc: Plc;
  /**
   * Compact mode: render the avatar grid only (no invite form, no
   * pending-invite list). Used by the dashboard tile preview. The
   * fullscreen view passes `compact=false` for the full management UI.
   */
  compact?: boolean;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Members body for the PLC dashboard. Compact mode renders a tight avatar
 * grid (the original tile preview); full mode adds an inline invite form
 * (lead-only), a pending-invite list with revoke, and per-row remove for
 * non-lead members.
 *
 * Phase 6 of the dashboard overhaul. Replaces the previous tab-only
 * member management UI; the avatar tile is now the entry point.
 */
export const MembersBody: React.FC<MembersBodyProps> = ({
  plc,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const { removeMember } = usePlcs({ enabled: !compact });
  const { sentInvites, sendInvite, revokeInvite } = usePlcInvitations({
    enabled: !compact,
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const isLead = user?.uid === plc.leadUid;

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

  const pendingInvitesForThisPlc = useMemo(() => {
    if (compact) return [];
    return sentInvites.filter(
      (inv) => inv.plcId === plc.id && inv.status === 'pending'
    );
  }, [sentInvites, plc.id, compact]);

  const handleSendInvite = async () => {
    setInviteError(null);
    setInviteSuccess(null);
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setInviteError(
        t('plcDashboard.members.invalidEmail', {
          defaultValue: 'Enter a valid email address.',
        })
      );
      return;
    }
    if (
      Object.values(plc.memberEmails).some((e) => e.toLowerCase() === trimmed)
    ) {
      setInviteError(
        t('plcDashboard.members.alreadyMember', {
          defaultValue: 'That email is already a member of this PLC.',
        })
      );
      return;
    }
    setInviteSubmitting(true);
    try {
      await sendInvite({
        plcId: plc.id,
        plcName: plc.name,
        inviteeEmail: trimmed,
      });
      setInviteEmail('');
      setInviteSuccess(
        t('plcDashboard.members.inviteSent', {
          defaultValue: 'Invitation sent to {{email}}.',
          email: trimmed,
        })
      );
    } catch (err) {
      logError('MembersBody.sendInvite', err, {
        plcId: plc.id,
        inviteeEmail: trimmed,
      });
      setInviteError(
        t('plcDashboard.members.inviteError', {
          defaultValue: 'Could not send invite. Try again in a moment.',
        })
      );
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRemoveMember = async (member: (typeof members)[number]) => {
    const confirmed = await showConfirm(
      t('plcDashboard.members.confirmRemove', {
        defaultValue: 'Remove {{email}} from this PLC?',
        email: member.email,
      }),
      {
        title: t('plcDashboard.members.confirmRemoveTitle', {
          defaultValue: 'Remove member',
        }),
        variant: 'danger',
        confirmLabel: t('plcDashboard.members.remove', {
          defaultValue: 'Remove',
        }),
      }
    );
    if (!confirmed) return;
    try {
      await removeMember(plc.id, member.uid);
    } catch (err) {
      logError('MembersBody.removeMember', err, {
        plcId: plc.id,
        memberUid: member.uid,
      });
    }
  };

  const handleRevokeInvite = async (
    invite: (typeof pendingInvitesForThisPlc)[number]
  ) => {
    try {
      await revokeInvite(invite);
    } catch (err) {
      logError('MembersBody.revokeInvite', err, {
        plcId: plc.id,
        inviteId: invite.id,
      });
    }
  };

  // Compact: just the avatar grid (the original tile preview).
  if (compact) {
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
  }

  // Fullscreen: avatar list + invite form (lead) + pending invites + remove.
  return (
    <div className="space-y-6">
      <section>
        <header className="flex items-center gap-2 mb-3">
          <Users2 className="w-4 h-4 text-brand-blue-primary" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700">
            {t('plcDashboard.members.heading', {
              defaultValue: 'Members',
            })}
          </h3>
          <span className="text-xs text-slate-500">{members.length}</span>
        </header>
        <ul className="space-y-1">
          {members.map((m) => (
            <li
              key={m.uid}
              className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-xl"
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xxs font-bold shadow-sm border ${
                  m.isYou
                    ? 'bg-brand-blue-primary text-white border-brand-blue-dark'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {initialsFromEmail(m.email)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {m.email || m.uid}
                </div>
                <div className="flex items-center gap-2 text-xxs text-slate-500 mt-0.5">
                  {m.isLead && (
                    <span className="inline-flex items-center gap-1 text-brand-red-primary font-bold uppercase tracking-wider">
                      <Crown className="w-3 h-3" />
                      {t('plcDashboard.members.lead', {
                        defaultValue: 'Lead',
                      })}
                    </span>
                  )}
                  {m.isYou && (
                    <span className="font-bold uppercase tracking-wider">
                      {t('plcDashboard.members.you', { defaultValue: 'You' })}
                    </span>
                  )}
                </div>
              </div>
              {isLead && !m.isLead && !m.isYou && (
                <button
                  type="button"
                  onClick={() => void handleRemoveMember(m)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label={t('plcDashboard.members.removeAriaLabel', {
                    defaultValue: 'Remove {{email}}',
                    email: m.email,
                  })}
                  title={t('plcDashboard.members.remove', {
                    defaultValue: 'Remove',
                  })}
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isLead && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-brand-blue-primary" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700">
              {t('plcDashboard.members.inviteHeading', {
                defaultValue: 'Invite a teacher',
              })}
            </h3>
          </header>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSendInvite();
                  }
                }}
                placeholder={t('plcDashboard.members.invitePlaceholder', {
                  defaultValue: 'teacher@school.edu',
                })}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 rounded-lg text-sm text-slate-700 transition-colors"
                disabled={inviteSubmitting}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSendInvite()}
              disabled={inviteSubmitting || !inviteEmail.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {inviteSubmitting
                ? t('plcDashboard.members.sending', {
                    defaultValue: 'Sending…',
                  })
                : t('plcDashboard.members.invite', { defaultValue: 'Invite' })}
            </button>
          </div>
          {inviteError && (
            <p className="text-xxs text-brand-red-primary font-semibold mt-2">
              {inviteError}
            </p>
          )}
          {inviteSuccess && !inviteError && (
            <p className="text-xxs text-emerald-600 font-semibold mt-2">
              {inviteSuccess}
            </p>
          )}
        </section>
      )}

      {isLead && pendingInvitesForThisPlc.length > 0 && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700">
              {t('plcDashboard.members.pendingHeading', {
                defaultValue: 'Pending invitations',
              })}
            </h3>
            <span className="text-xs text-slate-500">
              {pendingInvitesForThisPlc.length}
            </span>
          </header>
          <ul className="space-y-1">
            {pendingInvitesForThisPlc.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 px-3 py-2 bg-amber-50/40 border border-amber-200 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {inv.inviteeEmailLower}
                  </div>
                  <div className="text-xxs text-slate-500 mt-0.5">
                    {t('plcDashboard.members.pendingSince', {
                      defaultValue: 'Invited {{when}}',
                      when: new Date(inv.invitedAt).toLocaleDateString(),
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeInvite(inv)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xxs font-bold uppercase tracking-wider text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  aria-label={t('plcDashboard.members.revokeAriaLabel', {
                    defaultValue: 'Revoke invite for {{email}}',
                    email: inv.inviteeEmailLower,
                  })}
                  title={t('plcDashboard.members.revoke', {
                    defaultValue: 'Revoke',
                  })}
                >
                  <X className="w-3 h-3" />
                  {t('plcDashboard.members.revoke', {
                    defaultValue: 'Revoke',
                  })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isLead && (
        <p className="text-xxs text-slate-500 italic">
          {t('plcDashboard.members.notLead', {
            defaultValue: 'Only the PLC lead can invite or remove members.',
          })}
        </p>
      )}
    </div>
  );
};
