import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Mail, X, UserMinus, Users2, Crown } from 'lucide-react';

import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { Plc } from '@/types';

interface PlcEditModalProps {
  isOpen: boolean;
  /** Pass `null` to create a new PLC. */
  plc: Plc | null;
  onClose: () => void;
  /** Called when creating a new PLC. Existing PLC edits go through `usePlcs` directly. */
  onCreate: (name: string) => Promise<void>;
}

/**
 * Combined create/edit modal for a Professional Learning Community.
 *
 * - Create mode (`plc === null`): name input + Create button.
 * - Edit mode as lead: name input, member list with remove, invite-by-email
 *   form, outstanding-invites list with revoke.
 * - Edit mode as member: read-only name + member list (no actions).
 */
export const PlcEditModal: React.FC<PlcEditModalProps> = ({
  isOpen,
  plc,
  onClose,
  onCreate,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm, showAlert } = useDialog();
  const { renamePlc, removeMember } = usePlcs();
  const { sentInvites, sendInvite, revokeInvite } = usePlcInvitations();

  const isCreate = plc === null;
  const isLead = !isCreate && plc.leadUid === user?.uid;

  const [name, setName] = useState(plc?.name ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Outstanding (pending) invites for this PLC sent by the current user (lead).
  const outstanding = plc
    ? sentInvites.filter(
        (inv) => inv.plcId === plc.id && inv.status === 'pending'
      )
    : [];

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (isCreate) {
        await onCreate(trimmed);
        onClose();
      } else if (isLead && trimmed !== plc.name) {
        await renamePlc(plc.id, trimmed);
      }
      if (!isCreate) onClose();
    } catch (err) {
      console.error('Failed to save PLC:', err);
      await showAlert(
        err instanceof Error
          ? err.message
          : t('sidebar.plcs.saveFailed', {
              defaultValue: 'Failed to save PLC',
            }),
        { variant: 'danger' }
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plc) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy(true);
    try {
      await sendInvite({
        plcId: plc.id,
        plcName: plc.name,
        inviteeEmail: email,
      });
      setInviteEmail('');
    } catch (err) {
      console.error('Failed to send invite:', err);
      await showAlert(
        err instanceof Error
          ? err.message
          : t('sidebar.plcs.inviteFailed', {
              defaultValue: 'Failed to send invitation',
            }),
        { variant: 'danger' }
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (uid: string, label: string) => {
    if (!plc) return;
    const confirmed = await showConfirm(
      t('sidebar.plcs.confirmRemoveMember', {
        defaultValue: `Remove ${label} from "${plc.name}"?`,
        member: label,
        name: plc.name,
      }),
      {
        title: t('sidebar.plcs.confirmRemoveMemberTitle', {
          defaultValue: 'Remove Member',
        }),
        variant: 'danger',
        confirmLabel: t('sidebar.plcs.remove', { defaultValue: 'Remove' }),
      }
    );
    if (!confirmed) return;
    try {
      await removeMember(plc.id, uid);
    } catch (err) {
      console.error('Failed to remove member:', err);
      await showAlert(
        err instanceof Error
          ? err.message
          : t('sidebar.plcs.removeFailed', {
              defaultValue: 'Failed to remove member',
            }),
        { variant: 'danger' }
      );
    }
  };

  const title = isCreate
    ? t('sidebar.plcs.newPlcTitle', { defaultValue: 'New PLC' })
    : isLead
      ? t('sidebar.plcs.editPlcTitle', { defaultValue: 'Edit PLC' })
      : t('sidebar.plcs.viewPlcTitle', { defaultValue: 'PLC Details' });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={title}
      contentClassName="px-6 pb-6"
    >
      <div className="flex flex-col gap-5">
        {/* Name */}
        <div>
          <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            {t('sidebar.plcs.nameLabel', { defaultValue: 'PLC Name' })}
          </label>
          <input
            className="w-full px-3 py-2 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary font-bold disabled:bg-slate-50 disabled:text-slate-500"
            placeholder={t('sidebar.plcs.namePlaceholder', {
              defaultValue: 'e.g. 4th Grade Math PLC',
            })}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isCreate && !isLead}
            autoFocus={isCreate}
          />
        </div>

        {/* Members (edit mode only) */}
        {!isCreate && plc && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                {t('sidebar.plcs.membersLabel', { defaultValue: 'Members' })}
              </label>
              <span className="text-xxs font-bold text-slate-400">
                {plc.memberUids.length}
              </span>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
              {plc.memberUids.map((uid) => {
                const email = plc.memberEmails[uid] ?? '';
                const isMe = uid === user?.uid;
                const isMemberLead = uid === plc.leadUid;
                const label = email || uid;
                return (
                  <div
                    key={uid}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <div className="shrink-0 w-7 h-7 rounded-full bg-brand-blue-lighter flex items-center justify-center">
                      {isMemberLead ? (
                        <Crown className="w-3.5 h-3.5 text-brand-blue-primary" />
                      ) : (
                        <Users2 className="w-3.5 h-3.5 text-brand-blue-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 truncate">
                        {label}
                        {isMe && (
                          <span className="ml-1.5 text-xxs font-bold text-slate-400 uppercase tracking-wider">
                            {t('sidebar.plcs.youSuffix', {
                              defaultValue: '(You)',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    {isLead && !isMemberLead && (
                      <button
                        onClick={() => void handleRemoveMember(uid, label)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('sidebar.plcs.removeMember', {
                          defaultValue: 'Remove Member',
                        })}
                        aria-label={t('sidebar.plcs.removeMember', {
                          defaultValue: 'Remove Member',
                        })}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Invite (lead only) */}
        {isLead && plc && (
          <div>
            <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('sidebar.plcs.inviteLabel', {
                defaultValue: 'Invite by Email',
              })}
            </label>
            <form onSubmit={handleSendInvite} className="flex gap-2">
              <input
                type="email"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary"
                placeholder={t('sidebar.plcs.invitePlaceholder', {
                  defaultValue: 'colleague@school.edu',
                })}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !inviteEmail.trim()}
                className="bg-brand-blue-primary text-white px-3.5 py-2 rounded-xl flex gap-1.5 items-center text-xs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-3.5 h-3.5" />
                {t('sidebar.plcs.sendInvite', {
                  defaultValue: 'Invite',
                })}
              </button>
            </form>
            <p className="text-xxs text-slate-400 mt-1.5 leading-relaxed">
              {t('sidebar.plcs.inviteHelp', {
                defaultValue:
                  'Your colleague will see the invitation in their PLC sidebar the next time they sign in.',
              })}
            </p>
          </div>
        )}

        {/* Outstanding invites (lead only) */}
        {isLead && outstanding.length > 0 && (
          <div>
            <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {t('sidebar.plcs.outstandingLabel', {
                defaultValue: 'Pending Invitations',
              })}
            </label>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {outstanding.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0 truncate text-slate-700">
                    {inv.inviteeEmailLower}
                  </div>
                  <button
                    onClick={() => {
                      void revokeInvite(inv);
                    }}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title={t('sidebar.plcs.revokeInvite', {
                      defaultValue: 'Revoke Invitation',
                    })}
                    aria-label={t('sidebar.plcs.revokeInvite', {
                      defaultValue: 'Revoke Invitation',
                    })}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save button */}
        {(isCreate || isLead) && (
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={busy || !name.trim()}
              className="bg-brand-blue-primary text-white px-5 py-2 rounded-xl flex gap-1.5 items-center text-sm font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isCreate
                ? t('sidebar.plcs.createPlc', {
                    defaultValue: 'Create PLC',
                  })
                : t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
