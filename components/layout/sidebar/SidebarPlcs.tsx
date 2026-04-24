import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users2, Plus, Pencil, LogOut, Trash2, Mail } from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { Plc } from '@/types';
import { PlcEditModal } from './PlcEditModal';
import { PlcInvitesModal } from './PlcInvitesModal';

interface SidebarPlcsProps {
  isVisible: boolean;
}

/**
 * "My PLCs" sidebar page.
 *
 * Mirrors `SidebarClasses` — flat list of the user's PLCs with inline edit /
 * leave / delete actions and modals for create+edit + pending invites.
 */
export const SidebarPlcs: React.FC<SidebarPlcsProps> = ({ isVisible }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const { plcs, createPlc, leavePlc, deletePlc } = usePlcs();
  const { pendingInvites } = usePlcInvitations();

  // `editingPlcId === null` while no modal is open. The modal is open whenever
  // either `editingPlcId` is a plc id OR `isCreating` is true. Two pieces of
  // state instead of overloading a `'new'` sentinel — the literal would be
  // shadowed by the broader `string` type otherwise.
  const [editingPlcId, setEditingPlcId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showInvites, setShowInvites] = useState(false);

  const isModalOpen = isCreating || editingPlcId !== null;
  const editingPlc: Plc | null = editingPlcId
    ? (plcs.find((p) => p.id === editingPlcId) ?? null)
    : null;
  const closeEditModal = () => {
    setEditingPlcId(null);
    setIsCreating(false);
  };

  const handleCreate = async (name: string) => {
    await createPlc(name);
  };

  const handleLeave = async (plc: Plc) => {
    const confirmed = await showConfirm(
      t('sidebar.plcs.confirmLeave', {
        defaultValue: `Leave "${plc.name}"? You'll lose access to shared assignment results.`,
        name: plc.name,
      }),
      {
        title: t('sidebar.plcs.confirmLeaveTitle', {
          defaultValue: 'Leave PLC',
        }),
        variant: 'danger',
        confirmLabel: t('sidebar.plcs.leave', { defaultValue: 'Leave' }),
      }
    );
    if (confirmed) {
      await leavePlc(plc.id);
    }
  };

  const handleDelete = async (plc: Plc) => {
    const confirmed = await showConfirm(
      t('sidebar.plcs.confirmDelete', {
        defaultValue: `Delete "${plc.name}"? This will remove the PLC for everyone.`,
        name: plc.name,
      }),
      {
        title: t('sidebar.plcs.confirmDeleteTitle', {
          defaultValue: 'Delete PLC',
        }),
        variant: 'danger',
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
      }
    );
    if (confirmed) {
      await deletePlc(plc.id);
    }
  };

  return (
    <>
      <div
        className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
          isVisible
            ? 'translate-x-0 opacity-100 visible'
            : 'translate-x-full opacity-0 invisible'
        }`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-5">
            {/* Page Header */}
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                  <Users2 className="w-4 h-4 text-brand-blue-primary" />
                </div>
                <h2 className="text-sm font-bold text-slate-800">
                  {t('sidebar.plcs.title', { defaultValue: 'My PLCs' })}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('sidebar.plcs.description', {
                  defaultValue:
                    'Professional Learning Communities let you and your colleagues collaborate on the same assignments and see combined results.',
                })}
              </p>
            </div>

            {/* Top CTAs */}
            <div className="grid gap-2 grid-cols-2">
              <button
                onClick={() => setIsCreating(true)}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-brand-blue-primary text-white rounded-xl shadow-sm hover:bg-brand-blue-dark transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xxs font-bold uppercase tracking-wider">
                  {t('sidebar.plcs.newPlc', { defaultValue: 'New PLC' })}
                </span>
              </button>
              <button
                onClick={() => setShowInvites(true)}
                className="relative flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all"
              >
                <Mail className="w-4 h-4" />
                <span className="text-xxs font-bold uppercase tracking-wider">
                  {t('sidebar.plcs.invites', { defaultValue: 'Invites' })}
                </span>
                {pendingInvites.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red-primary text-white text-xxs font-bold flex items-center justify-center">
                    {pendingInvites.length}
                  </span>
                )}
              </button>
            </div>

            {/* PLC list */}
            {plcs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <Users2 className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-600">
                    {t('sidebar.plcs.emptyTitle', {
                      defaultValue: 'No PLCs yet',
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {pendingInvites.length > 0
                      ? t('sidebar.plcs.emptyHasInvites', {
                          defaultValue:
                            'You have pending invitations — accept one to get started.',
                        })
                      : t('sidebar.plcs.emptySubtitle', {
                          defaultValue:
                            'Create a PLC and invite your colleagues by email.',
                        })}
                  </p>
                </div>
                <button
                  onClick={() => setIsCreating(true)}
                  className="mt-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors"
                >
                  {t('sidebar.plcs.createNewPlc', {
                    defaultValue: 'Create New PLC',
                  })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                  {t('sidebar.plcs.yourPlcs', {
                    defaultValue: 'Your PLCs',
                  })}
                </h3>
                <div className="flex flex-col gap-2">
                  {plcs.map((plc) => {
                    const isLead = plc.leadUid === user?.uid;
                    return (
                      <div
                        key={plc.id}
                        className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all"
                      >
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                          <Users2 className="w-4 h-4 text-brand-blue-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">
                              {plc.name}
                            </div>
                            {isLead && (
                              <span className="text-xxs font-bold text-brand-blue-primary bg-brand-blue-lighter px-1.5 py-0.5 rounded uppercase tracking-wider">
                                {t('sidebar.plcs.leadBadge', {
                                  defaultValue: 'Lead',
                                })}
                              </span>
                            )}
                          </div>
                          <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
                            {t('sidebar.plcs.memberCount', {
                              count: plc.memberUids.length,
                              defaultValue: '{{count}} Member',
                              defaultValue_other: '{{count}} Members',
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => setEditingPlcId(plc.id)}
                            className="p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                            title={
                              isLead
                                ? t('sidebar.plcs.editPlc', {
                                    defaultValue: 'Edit PLC',
                                  })
                                : t('sidebar.plcs.viewPlc', {
                                    defaultValue: 'View PLC',
                                  })
                            }
                            aria-label={
                              isLead
                                ? t('sidebar.plcs.editPlc', {
                                    defaultValue: 'Edit PLC',
                                  })
                                : t('sidebar.plcs.viewPlc', {
                                    defaultValue: 'View PLC',
                                  })
                            }
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {isLead ? (
                            <button
                              onClick={() => void handleDelete(plc)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('sidebar.plcs.deletePlc', {
                                defaultValue: 'Delete PLC',
                              })}
                              aria-label={t('sidebar.plcs.deletePlc', {
                                defaultValue: 'Delete PLC',
                              })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleLeave(plc)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('sidebar.plcs.leavePlc', {
                                defaultValue: 'Leave PLC',
                              })}
                              aria-label={t('sidebar.plcs.leavePlc', {
                                defaultValue: 'Leave PLC',
                              })}
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <PlcEditModal
          key={editingPlcId ?? 'new'}
          isOpen
          plc={editingPlc}
          onClose={closeEditModal}
          onCreate={handleCreate}
        />
      )}

      {showInvites && (
        <PlcInvitesModal isOpen onClose={() => setShowInvites(false)} />
      )}
    </>
  );
};
