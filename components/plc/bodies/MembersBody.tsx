import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Crown,
  Mail,
  Plus,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users2,
  X,
} from 'lucide-react';
import { Plc, PlcMember, PlcRole } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { getPlcMembers, getPlcRole, isPlcLeadOrCoLead } from '@/utils/plc';
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
 * Roles a membership manager (lead / co-lead) can assign to a non-lead member
 * via the role `<select>`. `lead` is intentionally excluded — leadership only
 * moves through `transferLead` (the exactly-one-lead invariant); the rules
 * reject minting a second lead on the role-change branch.
 */
const ASSIGNABLE_ROLES: readonly Exclude<PlcRole, 'lead'>[] = [
  'coLead',
  'member',
  'viewer',
];

/**
 * Members body for the PLC dashboard.
 *
 * Compact mode renders a tight avatar grid (the original tile preview).
 *
 * Full mode is the membership-management surface. It reads the canonical
 * `members` map through the T1 helpers (`getPlcMembers` / `getPlcRole` /
 * `isPlcLeadOrCoLead`) so it works against BOTH the new map and legacy
 * `memberUids` / `memberEmails` / `leadUid` arrays (un-migrated PLCs). A
 * membership manager (lead or co-lead) can:
 *   - invite a teacher by email (lead/co-lead),
 *   - change a non-lead member's role (`coLead | member | viewer`),
 *   - transfer the lead role to another active member,
 *   - remove a non-lead member.
 * Every destructive / privilege-changing action is gated to managers in the UI
 * (re-enforced server-side by the PLC rules) and confirmed via a dialog. A
 * non-manager member sees the read-only roster plus a "Leave PLC" action.
 */
export const MembersBody: React.FC<MembersBodyProps> = ({
  plc,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const { removeMember, setMemberRole, transferLead, leavePlc } = usePlcs({
    enabled: !compact,
  });
  const { sentInvites, sendInvite, revokeInvite } = usePlcInvitations({
    enabled: !compact,
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  // uid currently mid-mutation (role change / remove / transfer), so its row
  // controls can disable to prevent a double-submit racing the snapshot.
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  // Read membership through the T1 helpers so this renders identically whether
  // the PLC carries the canonical `members` map or only the legacy arrays.
  const myUid = user?.uid ?? null;
  const myRole = myUid ? getPlcRole(plc, myUid) : null;
  const isManager = myUid ? isPlcLeadOrCoLead(plc, myUid) : false;

  const members = useMemo(() => {
    const all = getPlcMembers(plc);
    // Lead first, then co-leads, then everyone else; alphabetical by email
    // within a role band so the roster is stable and scannable.
    const rank: Record<PlcRole, number> = {
      lead: 0,
      coLead: 1,
      member: 2,
      viewer: 3,
    };
    return [...all].sort((a, b) => {
      const byRole = rank[a.role] - rank[b.role];
      if (byRole !== 0) return byRole;
      return (a.email || a.uid).localeCompare(b.email || b.uid);
    });
  }, [plc]);

  const memberEmailsLower = useMemo(
    () => new Set(members.map((m) => m.email).filter(Boolean)),
    [members]
  );

  const pendingInvitesForThisPlc = useMemo(() => {
    if (compact) return [];
    return sentInvites.filter(
      (inv) => inv.plcId === plc.id && inv.status === 'pending'
    );
  }, [sentInvites, plc.id, compact]);

  const roleLabel = (role: PlcRole): string => {
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
      case 'member':
      default:
        return t('plcDashboard.members.roles.member', {
          defaultValue: 'Member',
        });
    }
  };

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
    if (memberEmailsLower.has(trimmed)) {
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
        orgId: plc.orgId ?? null,
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

  const handleChangeRole = async (member: PlcMember, nextRole: PlcRole) => {
    if (nextRole === member.role) return;
    const confirmed = await showConfirm(
      t('plcDashboard.members.confirmRole', {
        defaultValue: 'Change {{email}} to {{role}}?',
        email: member.email || member.uid,
        role: roleLabel(nextRole),
      }),
      {
        title: t('plcDashboard.members.confirmRoleTitle', {
          defaultValue: 'Change role',
        }),
        confirmLabel: t('plcDashboard.members.confirmRoleAction', {
          defaultValue: 'Change role',
        }),
      }
    );
    if (!confirmed) return;
    setPendingUid(member.uid);
    try {
      await setMemberRole(plc.id, member.uid, nextRole);
    } catch (err) {
      logError('MembersBody.setMemberRole', err, {
        plcId: plc.id,
        memberUid: member.uid,
        role: nextRole,
      });
    } finally {
      setPendingUid(null);
    }
  };

  const handleTransferLead = async (member: PlcMember) => {
    const confirmed = await showConfirm(
      t('plcDashboard.members.confirmTransfer', {
        defaultValue:
          'Make {{email}} the lead of this PLC? You will become a regular member.',
        email: member.email || member.uid,
      }),
      {
        title: t('plcDashboard.members.confirmTransferTitle', {
          defaultValue: 'Transfer lead',
        }),
        variant: 'danger',
        confirmLabel: t('plcDashboard.members.makeLead', {
          defaultValue: 'Make lead',
        }),
      }
    );
    if (!confirmed) return;
    setPendingUid(member.uid);
    try {
      await transferLead(plc.id, member.uid);
    } catch (err) {
      logError('MembersBody.transferLead', err, {
        plcId: plc.id,
        memberUid: member.uid,
      });
    } finally {
      setPendingUid(null);
    }
  };

  const handleRemoveMember = async (member: PlcMember) => {
    const confirmed = await showConfirm(
      t('plcDashboard.members.confirmRemove', {
        defaultValue: 'Remove {{email}} from this PLC?',
        email: member.email || member.uid,
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
    setPendingUid(member.uid);
    try {
      await removeMember(plc.id, member.uid);
    } catch (err) {
      logError('MembersBody.removeMember', err, {
        plcId: plc.id,
        memberUid: member.uid,
      });
    } finally {
      setPendingUid(null);
    }
  };

  const handleLeave = async () => {
    const confirmed = await showConfirm(
      t('plcDashboard.members.confirmLeave', {
        defaultValue:
          'Leave this PLC? You will lose access to shared assignment results.',
      }),
      {
        title: t('plcDashboard.members.confirmLeaveTitle', {
          defaultValue: 'Leave PLC',
        }),
        variant: 'danger',
        confirmLabel: t('plcDashboard.members.leave', {
          defaultValue: 'Leave',
        }),
      }
    );
    if (!confirmed) return;
    try {
      await leavePlc(plc.id);
    } catch (err) {
      logError('MembersBody.leavePlc', err, { plcId: plc.id });
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
          {members.map((m) => {
            const isYou = m.uid === myUid;
            // Compose a single accessible label so screen readers get
            // "alice@school.edu, lead, you" instead of just the initials.
            const ariaLabel = `${m.email || m.uid}, ${roleLabel(m.role)}${isYou ? `, ${t('plcDashboard.members.you', { defaultValue: 'You' })}` : ''}`;
            return (
              <div
                key={m.uid}
                role="img"
                aria-label={ariaLabel}
                className={`relative flex items-center justify-center w-9 h-9 rounded-full text-xxs font-bold shadow-sm border ${
                  isYou
                    ? 'bg-brand-blue-primary text-white border-brand-blue-dark'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
                title={`${m.email} (${roleLabel(m.role)})${isYou ? ` · ${t('plcDashboard.members.you', { defaultValue: 'You' })}` : ''}`}
              >
                <span aria-hidden="true">{initialsFromEmail(m.email)}</span>
                {m.role === 'lead' && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red-primary border border-white"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fullscreen: roster with roles + manager controls + invite form + leave.
  return (
    <div className="space-y-6 p-4 md:p-6">
      <section>
        <header className="flex items-center gap-2 mb-3">
          <Users2
            aria-hidden="true"
            className="w-4 h-4 text-brand-blue-primary"
          />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700">
            {t('plcDashboard.members.heading', {
              defaultValue: 'Members',
            })}
          </h3>
          <span className="text-xs text-slate-500">{members.length}</span>
        </header>
        <ul className="space-y-1">
          {members.map((m) => {
            const isYou = m.uid === myUid;
            const isMemberLead = m.role === 'lead';
            // Managers can act on every active member except the sitting lead
            // and themselves. (A manager demoting / removing themselves is not
            // offered here — they leave via "Leave PLC".)
            const canManageRow = isManager && !isMemberLead && !isYou;
            const rowBusy = pendingUid === m.uid;
            return (
              <li
                key={m.uid}
                className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-xl"
              >
                <div
                  aria-hidden="true"
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xxs font-bold shadow-sm border ${
                    isYou
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
                    <span
                      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider ${
                        isMemberLead
                          ? 'text-brand-red-primary'
                          : m.role === 'coLead'
                            ? 'text-brand-blue-primary'
                            : m.role === 'viewer'
                              ? 'text-slate-400'
                              : 'text-slate-500'
                      }`}
                    >
                      {isMemberLead && (
                        <Crown aria-hidden="true" className="w-3 h-3" />
                      )}
                      {m.role === 'coLead' && (
                        <ShieldCheck aria-hidden="true" className="w-3 h-3" />
                      )}
                      {roleLabel(m.role)}
                    </span>
                    {isYou && (
                      <span className="font-bold uppercase tracking-wider text-slate-600">
                        {t('plcDashboard.members.you', { defaultValue: 'You' })}
                      </span>
                    )}
                  </div>
                </div>
                {canManageRow && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="sr-only" htmlFor={`plc-role-${m.uid}`}>
                      {t('plcDashboard.members.roleSelectAriaLabel', {
                        defaultValue: 'Role for {{email}}',
                        email: m.email || m.uid,
                      })}
                    </label>
                    <select
                      id={`plc-role-${m.uid}`}
                      value={m.role === 'lead' ? 'member' : m.role}
                      disabled={rowBusy}
                      onChange={(e) =>
                        void handleChangeRole(m, e.target.value as PlcRole)
                      }
                      className="text-xxs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleTransferLead(m)}
                      disabled={rowBusy}
                      className="p-1.5 text-slate-400 hover:text-brand-red-primary hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={t('plcDashboard.members.makeLeadAriaLabel', {
                        defaultValue: 'Make {{email}} the lead',
                        email: m.email || m.uid,
                      })}
                      title={t('plcDashboard.members.makeLead', {
                        defaultValue: 'Make lead',
                      })}
                    >
                      <Crown aria-hidden="true" className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(m)}
                      disabled={rowBusy}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={t('plcDashboard.members.removeAriaLabel', {
                        defaultValue: 'Remove {{email}}',
                        email: m.email || m.uid,
                      })}
                      title={t('plcDashboard.members.remove', {
                        defaultValue: 'Remove',
                      })}
                    >
                      <UserMinus aria-hidden="true" className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isManager && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <UserPlus
              aria-hidden="true"
              className="w-4 h-4 text-brand-blue-primary"
            />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700">
              {t('plcDashboard.members.inviteHeading', {
                defaultValue: 'Invite a teacher',
              })}
            </h3>
          </header>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
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
                aria-label={t('plcDashboard.members.inviteHeading', {
                  defaultValue: 'Invite a teacher',
                })}
                aria-invalid={inviteError != null}
                aria-describedby="plc-invite-feedback"
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 rounded-lg text-sm text-slate-700 transition-colors"
                disabled={inviteSubmitting}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSendInvite()}
              disabled={inviteSubmitting || !inviteEmail.trim()}
              aria-busy={inviteSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
            >
              <Plus aria-hidden="true" className="w-3.5 h-3.5" />
              {inviteSubmitting
                ? t('plcDashboard.members.sending', {
                    defaultValue: 'Sending…',
                  })
                : t('plcDashboard.members.invite', { defaultValue: 'Invite' })}
            </button>
          </div>
          {/* Single live region so error and success messages get announced
              to screen readers as they appear. `role="status"` covers both
              transient confirmations and errors; this is intentionally NOT
              `role="alert"` because the submit handler already gates on
              client-side validation and we don't want to interrupt the
              flow for a non-critical email-format complaint. */}
          <div
            id="plc-invite-feedback"
            role="status"
            aria-live="polite"
            className="mt-2 min-h-[1rem]"
          >
            {inviteError && (
              <p className="text-xxs text-brand-red-primary font-semibold">
                {inviteError}
              </p>
            )}
            {inviteSuccess && !inviteError && (
              <p className="text-xxs text-emerald-600 font-semibold">
                {inviteSuccess}
              </p>
            )}
          </div>
        </section>
      )}

      {isManager && pendingInvitesForThisPlc.length > 0 && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <Mail aria-hidden="true" className="w-4 h-4 text-amber-600" />
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
                  <X aria-hidden="true" className="w-3 h-3" />
                  {t('plcDashboard.members.revoke', {
                    defaultValue: 'Revoke',
                  })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isManager && (
        <p className="text-xxs text-slate-500 italic">
          {t('plcDashboard.members.notManager', {
            defaultValue:
              'Only the PLC lead or a co-lead can invite, remove, or change members.',
          })}
        </p>
      )}

      {/* Leave PLC — available to any active member who is not the lead. The
          lead must transfer leadership before leaving (rules + hook enforce
          this); offering "Leave" to the lead would only surface a thrown
          error, so it is hidden for them. */}
      {myRole != null && myRole !== 'lead' && (
        <section className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xxs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <UserMinus aria-hidden="true" className="w-3.5 h-3.5" />
            {t('plcDashboard.members.leavePlc', {
              defaultValue: 'Leave this PLC',
            })}
          </button>
        </section>
      )}
    </div>
  );
};
