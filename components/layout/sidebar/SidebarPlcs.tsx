import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users2,
  Plus,
  Pencil,
  LogOut,
  Trash2,
  Mail,
  MoreVertical,
} from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { OverflowMenu } from '@/components/common/OverflowMenu';
import { usePlcUnread } from '@/hooks/usePlcUnread';
import {
  Plc,
  PlcGroupType,
  PlcInvitation,
  PlcTeamLayout,
  getPlcGroupType,
} from '@/types';
import { groupTypeLabel } from '@/components/plc/groupTypes';
import { getPlcMembers, getPlcRole } from '@/utils/plc';
import { PlcEditModal } from './PlcEditModal';
import { PlcInvitesModal } from './PlcInvitesModal';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { layoutForNewTeam } from '@/components/plc/teams/teamRollout';

interface SidebarPlcsProps {
  isVisible: boolean;
  /** PLC list + actions, lifted to `Sidebar` so the listener only mounts once. */
  plcs: Plc[];
  plcsLoading: boolean;
  createPlc: (
    name: string,
    groupType?: PlcGroupType,
    layout?: PlcTeamLayout
  ) => Promise<string>;
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
  rowKey: string;
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
 * backdrop button element (the row click) with the visible content + kebab
 * layered above. `pointer-events-none` on the static visual content lets
 * clicks fall through to the backdrop; `pointer-events-auto` on the kebab
 * captures its own clicks. This avoids the invalid nested-button HTML
 * the previous split-row layout was working around.
 */
const PlcRow: React.FC<PlcRowProps> = ({
  plc,
  isLead,
  unreadEnabled,
  rowKey,
  onOpen,
  onEdit,
  onDelete,
  onLeave,
}) => {
  const { t } = useTranslation();
  const { unreadCount } = usePlcUnread(plc.id, { enabled: unreadEnabled });

  const unreadBadge = unreadCount > 0 && (
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
  );

  const kebabMenu = (
    <OverflowMenu
      items={[
        {
          id: 'edit',
          label: isLead
            ? t('sidebar.plcs.editPlc', { defaultValue: 'Edit PLC' })
            : t('sidebar.plcs.viewPlc', { defaultValue: 'View PLC' }),
          icon: Pencil,
          onClick: onEdit,
          anchor: tourFieldAttr('plcs.edit-plc', 'plcs', rowKey),
        },
        isLead
          ? {
              id: 'delete',
              label: t('sidebar.plcs.deletePlc', {
                defaultValue: 'Delete PLC',
              }),
              icon: Trash2,
              destructive: true,
              onClick: onDelete,
              anchor: tourFieldAttr('plcs.delete-plc', 'plcs', rowKey),
            }
          : {
              id: 'leave',
              label: t('sidebar.plcs.leavePlc', { defaultValue: 'Leave PLC' }),
              icon: LogOut,
              destructive: true,
              onClick: onLeave,
              anchor: tourFieldAttr('plcs.leave-plc', 'plcs', rowKey),
            },
      ]}
      ariaLabel={t('sidebar.plcs.actionsMenu', { defaultValue: 'PLC actions' })}
      triggerIcon={MoreVertical}
      triggerAnchor={tourFieldAttr('plcs.actions-menu', 'plcs', rowKey)}
      triggerClassName="rounded-lg text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter"
      triggerStyle={{ width: 28, height: 28 }}
      iconStyle={{ width: 16, height: 16 }}
    />
  );

  return (
    <li className="group relative flex items-center gap-1 py-2 px-1 hover:bg-slate-50 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        {...tourFieldAttr('plcs.open-plc', 'plcs', rowKey)}
        className="absolute inset-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary"
        aria-label={t('sidebar.plcs.openDashboard', {
          defaultValue: 'Open {{name}} dashboard',
          name: plc.name,
        })}
      />
      <div className="relative flex-1 min-w-0 py-1 pl-1.5 pointer-events-none">
        <div className="text-sm font-bold leading-snug text-slate-800 group-hover:text-brand-blue-primary transition-colors wrap-anywhere">
          {plc.name}
        </div>
        <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
          {isLead && (
            <span className="text-brand-blue-primary">
              {`${t('sidebar.plcs.leadBadge', { defaultValue: 'Lead' })} · `}
            </span>
          )}
          {`${groupTypeLabel(t, getPlcGroupType(plc))} · `}
          {t('sidebar.plcs.memberCount', {
            count: getPlcMembers(plc).length,
            defaultValue: '{{count}} Member',
            defaultValue_other: '{{count}} Members',
          })}
        </div>
      </div>
      <div className="relative flex items-center gap-0.5 shrink-0 pointer-events-auto">
        {unreadBadge}
        {kebabMenu}
      </div>
    </li>
  );
};

/**
 * "My Teams" sidebar page.
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

  const handleCreate = async (name: string, groupType: PlcGroupType) => {
    const layout = await layoutForNewTeam(groupType);
    if (layout) await createPlc(name, groupType, layout);
    else await createPlc(name, groupType);
  };

  const handleLeave = async (plc: Plc) => {
    const confirmed = await showConfirm(
      t('sidebar.plcs.confirmLeave', {
        defaultValue: `Leave "${plc.name}"? You'll lose access to shared assignment results.`,
        name: plc.name,
      }),
      {
        title: t('sidebar.groups.confirmLeaveTitle', {
          defaultValue: 'Leave team',
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
      t('sidebar.groups.confirmDelete', {
        defaultValue: `Delete "${plc.name}"? This will remove the group for everyone.`,
        name: plc.name,
      }),
      {
        title: t('sidebar.groups.confirmDeleteTitle', {
          defaultValue: 'Delete team',
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
        className={`absolute inset-0 flex flex-col transition-[translate,opacity,visibility] duration-200 ease-out-strong motion-reduce:transition-[opacity,visibility] motion-reduce:translate-x-0 ${
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
                  {t('sidebar.groups.title', { defaultValue: 'My Teams' })}
                </h2>
              </div>
            </div>

            {/* Top CTAs */}
            <div className="grid gap-2 grid-cols-2">
              <button
                onClick={() => setIsCreating(true)}
                {...tourAttr('plcs.new-plc')}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-brand-blue-primary text-white rounded-xl shadow-xs hover:bg-brand-blue-dark transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xxs font-bold uppercase tracking-wider">
                  {t('sidebar.groups.new', { defaultValue: 'New team' })}
                </span>
              </button>
              <button
                onClick={() => setShowInvites(true)}
                {...tourAttr('plcs.invites')}
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
                    {t('sidebar.groups.emptyTitle', {
                      defaultValue: 'No teams yet',
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {pendingInvites.length > 0
                      ? t('sidebar.plcs.emptyHasInvites', {
                          defaultValue:
                            'You have pending invitations — accept one to get started.',
                        })
                      : t('sidebar.groups.emptySubtitle', {
                          defaultValue:
                            'Create a team and invite your colleagues by email.',
                        })}
                  </p>
                </div>
                <button
                  {...tourAttr('plcs.empty-create')}
                  onClick={() => setIsCreating(true)}
                  className="mt-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-xs transition-colors"
                >
                  {t('sidebar.groups.createNew', {
                    defaultValue: 'Create a team',
                  })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                  {t('sidebar.groups.yours', {
                    defaultValue: 'Your teams',
                  })}
                </h3>
                <ul
                  className="divide-y divide-slate-200 border-y border-slate-200"
                  {...tourAttr('plcs.plc-list')}
                >
                  {plcs.map((plc, plcIndex) => {
                    const isLead = user?.uid
                      ? getPlcRole(plc, user.uid) === 'lead'
                      : false;
                    return (
                      <PlcRow
                        key={plc.id}
                        plc={plc}
                        isLead={isLead}
                        unreadEnabled={isVisible}
                        rowKey={`row-${plcIndex + 1}`}
                        onOpen={() => onOpenDashboard(plc.id)}
                        onEdit={() => setEditingPlcId(plc.id)}
                        onDelete={() => void handleDelete(plc)}
                        onLeave={() => void handleLeave(plc)}
                      />
                    );
                  })}
                </ul>
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
