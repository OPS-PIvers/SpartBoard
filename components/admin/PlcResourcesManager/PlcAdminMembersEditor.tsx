import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, UserMinus } from 'lucide-react';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { getPlcMembers } from '@/utils/plc';
import type { Plc, PlcMember, PlcRole } from '@/types';

export type AdminMemberRole = Exclude<PlcRole, 'lead'>;

export interface AdminMemberTarget {
  uid: string;
  email: string;
  displayName: string;
}

interface PlcAdminMembersEditorProps {
  plc: Plc;
  orgId: string;
  busy: boolean;
  onSetMember: (target: AdminMemberTarget, role: AdminMemberRole) => void;
  onRemoveMember: (member: PlcMember) => void;
}

const ROLES: AdminMemberRole[] = ['coLead', 'member', 'viewer'];

/** Admin-only member list for one PLC: add an org teacher, change a role, or remove. */
export const PlcAdminMembersEditor: React.FC<PlcAdminMembersEditorProps> = ({
  plc,
  orgId,
  busy,
  onSetMember,
  onRemoveMember,
}) => {
  const { t } = useTranslation();
  const { members: orgMembers, loading } = useOrgMembers(orgId);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<AdminMemberRole>('member');

  const plcMembers = useMemo(() => getPlcMembers(plc), [plc]);
  const nonLead = plcMembers.filter((m) => m.uid !== plc.leadUid);

  // Only teachers who have signed in (uid linked) and aren't already members.
  const addable = useMemo(() => {
    const activeUids = new Set(plcMembers.map((m) => m.uid));
    return orgMembers
      .filter(
        (m): m is typeof m & { uid: string } =>
          typeof m.uid === 'string' &&
          m.uid.length > 0 &&
          m.status === 'active' &&
          !activeUids.has(m.uid)
      )
      .sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email, undefined, {
          sensitivity: 'base',
        })
      );
  }, [orgMembers, plcMembers]);

  const roleLabel = (role: PlcRole) =>
    t(`plcDashboard.members.roles.${role}`, {
      defaultValue:
        role === 'coLead'
          ? 'Co-lead'
          : role.charAt(0).toUpperCase() + role.slice(1),
    });

  const handleAdd = () => {
    const pick = addable.find((m) => m.email === selectedEmail);
    if (!pick) return;
    onSetMember(
      { uid: pick.uid, email: pick.email, displayName: pick.name ?? '' },
      selectedRole
    );
    setSelectedEmail('');
  };

  return (
    <div
      className="mt-3 pt-3 border-t border-slate-100 space-y-3"
      data-testid="admin-members-editor"
    >
      <p className="text-xs text-slate-600">
        {t('admin.plc.recovery.membersDescription', {
          defaultValue:
            'Add a teacher from your organization, change a role, or remove a member. The teacher is not notified.',
        })}
      </p>

      {nonLead.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          {t('admin.plc.recovery.noOtherMembers', {
            defaultValue: 'No members besides the lead.',
          })}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {nonLead.map((m) => (
            <li
              key={m.uid}
              className="flex items-center gap-2 text-sm text-slate-800"
            >
              <span className="min-w-0 flex-1 truncate">
                {m.displayName || m.email || m.uid}
                {m.email && m.displayName && (
                  <span className="text-xs text-slate-500"> · {m.email}</span>
                )}
              </span>
              <label className="sr-only" htmlFor={`role-${plc.id}-${m.uid}`}>
                {t('admin.plc.recovery.roleLabel', { defaultValue: 'Role' })}
              </label>
              <select
                id={`role-${plc.id}-${m.uid}`}
                value={m.role}
                disabled={busy}
                onChange={(e) =>
                  onSetMember(
                    { uid: m.uid, email: m.email, displayName: m.displayName },
                    e.target.value as AdminMemberRole
                  )
                }
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onRemoveMember(m)}
                disabled={busy}
                aria-label={t('admin.plc.recovery.removeMember', {
                  defaultValue: 'Remove {{name}}',
                  name: m.displayName || m.email || m.uid,
                })}
                className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 px-2 py-1 rounded-lg transition-colors"
              >
                <UserMinus className="w-4 h-4" aria-hidden="true" />
                {t('admin.plc.recovery.remove', { defaultValue: 'Remove' })}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <label className="sr-only" htmlFor={`add-member-${plc.id}`}>
          {t('admin.plc.recovery.addMemberLabel', {
            defaultValue: 'Teacher to add',
          })}
        </label>
        <select
          id={`add-member-${plc.id}`}
          value={selectedEmail}
          onChange={(e) => setSelectedEmail(e.target.value)}
          disabled={busy || loading}
          className="min-w-0 flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        >
          <option value="">
            {loading
              ? t('admin.plc.recovery.loadingTeachers', {
                  defaultValue: 'Loading teachers…',
                })
              : t('admin.plc.recovery.chooseTeacher', {
                  defaultValue: 'Choose a teacher…',
                })}
          </option>
          {addable.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name ? `${m.name} · ${m.email}` : m.email}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`add-role-${plc.id}`}>
          {t('admin.plc.recovery.roleLabel', { defaultValue: 'Role' })}
        </label>
        <select
          id={`add-role-${plc.id}`}
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as AdminMemberRole)}
          disabled={busy}
          className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !selectedEmail}
          className="flex items-center gap-1 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          {t('admin.plc.recovery.addMember', { defaultValue: 'Add' })}
        </button>
      </div>
      {!loading && addable.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          {t('admin.plc.recovery.noAddableTeachers', {
            defaultValue:
              'Every signed-in teacher in your organization is already a member.',
          })}
        </p>
      )}
    </div>
  );
};
