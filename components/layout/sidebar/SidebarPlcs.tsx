import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users2,
  Plus,
  Pencil,
  LogOut,
  Trash2,
  Mail,
  ChevronRight,
  MoreVertical,
} from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useClickOutside } from '@/hooks/useClickOutside';
import { usePlcUnread } from '@/hooks/usePlcUnread';
import { Plc, PlcInvitation } from '@/types';
import { getPlcMembers, getPlcRole } from '@/utils/plc';
import { PlcEditModal } from './PlcEditModal';
import { PlcInvitesModal } from './PlcInvitesModal';

interface SidebarPlcsProps {
  isVisible: boolean;
  /** PLC list + actions, lifted to `Sidebar` so the listener only mounts once. */
  plcs: Plc[];
  plcsLoading: boolean;
  createPlc: (name: string) => Promise<string>;
  leavePlc: (plcId: string) => Promise<void>;
  deletePlc: (plcId: string) => Promise<void>;
  /** Pending invites, lifted alongside `plcs` for the same reason. */
  pendingInvites: PlcInvitation[];
  /** Open the full PLC Dashboard for the selected PLC. */
  onOpenDashboard: (plcId: string) => void;
}

interface PlcRowProps {
  plc: Plc;
  isLead: boolean;
  /** Gate the per-row unread listeners to while the sidebar drawer is open. */
  unreadEnabled: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLeave: () => void;
}

/**
 * One PLC card in the sidebar list.
 *
 * Click-affordance design: the entire card is a single click target that
 * opens the PLC Dashboard. Secondary actions (edit/view, delete/leave)
 * collapse into a kebab popover. Implemented as an absolute-positioned
 * backdrop `<button>` (the row click) with the visible content + kebab
 * layered above. `pointer-events-none` on the static visual content lets
 * clicks fall through to the backdrop; `pointer-events-auto` on the kebab
 * captures its own clicks. This avoids the invalid nested-button HTML
 * the previous split-row layout was working around.
 */
const PlcRow: React.FC<PlcRowProps> = ({
  plc,
  isLead,
  unreadEnabled,
  onOpen,
  onEdit,
  onDelete,
  onLeave,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);

  // "Since you were here" badge (Decision 2.2, §3.4) — count of activity events
  // newer than this member's `plc_state/{plcId}.lastSeenAt` cursor. The hook
  // self-subscribes (the sidebar is not under a PlcProvider); gate it to while
  // the drawer is open so the listeners tear down when the sidebar closes.
  const { unreadCount } = usePlcUnread(plc.id, { enabled: unreadEnabled });

  useClickOutside(menuRef, () => setMenuOpen(false), [kebabRef]);

  // Escape closes the menu and restores focus to the kebab button.
  // `aria-haspopup="menu"` on the kebab implies this contract per WAI-ARIA
  // menu-button practices. Mounted only while the menu is open to avoid a
  // global listener tax for every PLC row in the sidebar.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenuOpen(false);
        kebabRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen]);

  const handleMenuClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    setMenuOpen(false);
    action();
  };

  return (
    <div className="group relative flex items-center gap-2 p-2.5 bg-white border border-slate-200 hover:border-brand-blue-primary/40 hover:bg-brand-blue-lighter/20 rounded-xl transition-all">
      {/* Backdrop click target — covers the full card so clicking anywhere
          (except the kebab) opens the dashboard. */}
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
        aria-label={t('sidebar.plcs.openDashboard', {
          defaultValue: 'Open {{name}} dashboard',
          name: plc.name,
        })}
      />

      {/* Visible content. `pointer-events-none` so clicks pass through to
          the backdrop button. */}
      <div className="relative flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
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
                {t('sidebar.plcs.leadBadge', { defaultValue: 'Lead' })}
              </span>
            )}
          </div>
          <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
            {t('sidebar.plcs.memberCount', {
              count: getPlcMembers(plc).length,
              defaultValue: '{{count}} Member',
              defaultValue_other: '{{count}} Members',
            })}
          </div>
        </div>
      </div>

      {/* Right-side cluster: unread badge + chevron affordance + kebab.
          `pointer-events-auto` re-enables clicks here so the kebab fires its own
          handler. */}
      <div className="relative flex items-center gap-0.5 shrink-0 pointer-events-auto">
        {unreadCount > 0 && (
          <span
            className="min-w-[18px] h-[18px] px-1 mr-0.5 rounded-full bg-brand-red-primary text-white text-xxs font-bold flex items-center justify-center"
            aria-label={t('sidebar.plcs.unreadBadge', {
              count: unreadCount,
              defaultValue: '{{count}} new since your last visit',
            })}
            title={t('sidebar.plcs.unreadBadge', {
              count: unreadCount,
              defaultValue: '{{count}} new since your last visit',
            })}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <ChevronRight
          className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors"
          aria-hidden="true"
        />
        <button
          ref={kebabRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          className="p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('sidebar.plcs.actionsMenu', {
            defaultValue: 'PLC actions',
          })}
          title={t('sidebar.plcs.actionsMenu', {
            defaultValue: 'PLC actions',
          })}
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-0 top-full mt-1 z-20 min-w-[160px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
            data-click-outside-ignore="true"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => handleMenuClick(e, onEdit)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500" />
              {isLead
                ? t('sidebar.plcs.editPlc', { defaultValue: 'Edit PLC' })
                : t('sidebar.plcs.viewPlc', { defaultValue: 'View PLC' })}
            </button>
            {isLead ? (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => handleMenuClick(e, onDelete)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left border-t border-slate-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('sidebar.plcs.deletePlc', { defaultValue: 'Delete PLC' })}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => handleMenuClick(e, onLeave)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left border-t border-slate-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                {t('sidebar.plcs.leavePlc', { defaultValue: 'Leave PLC' })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * "My PLCs" sidebar page.
 *
 * Mirrors `SidebarClasses` — flat list of the user's PLCs with a kebab
 * action menu and modals for create+edit + pending invites.
 */
export const SidebarPlcs: React.FC<SidebarPlcsProps> = ({
  isVisible,
  plcs,
  plcsLoading,
  createPlc,
  leavePlc,
  deletePlc,
  pendingInvites,
  onOpenDashboard,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const loading = plcsLoading;

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
            {loading ? (
              // Render an inert placeholder during the initial snapshot so we
              // don't briefly flash "No PLCs yet" for users who actually have
              // some.
              <div className="py-12" aria-hidden />
            ) : plcs.length === 0 ? (
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
                    const isLead = user?.uid
                      ? getPlcRole(plc, user.uid) === 'lead'
                      : false;
                    return (
                      <PlcRow
                        key={plc.id}
                        plc={plc}
                        isLead={isLead}
                        unreadEnabled={isVisible}
                        onOpen={() => onOpenDashboard(plc.id)}
                        onEdit={() => setEditingPlcId(plc.id)}
                        onDelete={() => void handleDelete(plc)}
                        onLeave={() => void handleLeave(plc)}
                      />
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
