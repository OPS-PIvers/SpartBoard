import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Check, X } from 'lucide-react';

import { Modal } from '@/components/common/Modal';
import { useDialog } from '@/context/useDialog';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { PlcInvitation } from '@/types';

interface PlcInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal listing the current user's pending PLC invitations with Accept /
 * Decline actions. Triggered from the SidebarPlcs "Invites" button.
 */
export const PlcInvitesModal: React.FC<PlcInvitesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { showAlert } = useDialog();
  const { pendingInvites, acceptInvite, declineInvite } = usePlcInvitations();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAccept = async (invite: PlcInvitation) => {
    setBusyId(invite.id);
    try {
      await acceptInvite(invite);
    } catch (err) {
      console.error('Failed to accept invite:', err);
      await showAlert(
        err instanceof Error
          ? err.message
          : t('sidebar.plcs.acceptFailed', {
              defaultValue: 'Failed to accept invitation',
            }),
        { variant: 'danger' }
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (invite: PlcInvitation) => {
    setBusyId(invite.id);
    try {
      await declineInvite(invite);
    } catch (err) {
      console.error('Failed to decline invite:', err);
      await showAlert(
        err instanceof Error
          ? err.message
          : t('sidebar.plcs.declineFailed', {
              defaultValue: 'Failed to decline invitation',
            }),
        { variant: 'danger' }
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      title={t('sidebar.plcs.invitesTitle', {
        defaultValue: 'Pending PLC Invitations',
      })}
      contentClassName="px-6 pb-6"
    >
      {pendingInvites.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-400">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <Mail className="w-6 h-6 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-600">
              {t('sidebar.plcs.noInvitesTitle', {
                defaultValue: 'No pending invitations',
              })}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('sidebar.plcs.noInvitesSubtitle', {
                defaultValue:
                  'You\u2019ll see invitations here when a colleague invites you to their PLC.',
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pendingInvites.map((invite) => {
            const busy = busyId === invite.id;
            return (
              <div
                key={invite.id}
                className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                  <Mail className="w-4 h-4 text-brand-blue-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {invite.plcName}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {t('sidebar.plcs.inviteFrom', {
                      defaultValue: 'Invited by {{name}}',
                      name: invite.invitedByName,
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void handleDecline(invite)}
                    disabled={busy}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('sidebar.plcs.decline', {
                      defaultValue: 'Decline',
                    })}
                    aria-label={t('sidebar.plcs.decline', {
                      defaultValue: 'Decline',
                    })}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void handleAccept(invite)}
                    disabled={busy}
                    className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('sidebar.plcs.accept', {
                      defaultValue: 'Accept',
                    })}
                    aria-label={t('sidebar.plcs.accept', {
                      defaultValue: 'Accept',
                    })}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
