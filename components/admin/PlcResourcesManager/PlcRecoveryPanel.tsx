import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Crown, UserCog, Trash2, X, Check } from 'lucide-react';
import { usePlcs } from '@/hooks/usePlcs';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { getPlcMembers } from '@/utils/plc';
import { Plc, PlcMember } from '@/types';

/**
 * Admin recovery surface (Decision 3.4, §3.4 / §6): lets an in-org SITE ADMIN
 * rescue an abandoned PLC by either reassigning the `lead` role to an existing
 * active member or dissolving the PLC entirely. Both actions confirm first.
 *
 * Gating (defense-in-depth over the `isAdminManagingPlc` / admin-delete rules):
 *   - hidden entirely unless the current user `isAdmin`,
 *   - hidden when the admin has no resolved `orgId` (org-less admins can't
 *     scope recovery),
 *   - lists ONLY PLCs whose `orgId` matches the admin's org — an admin can
 *     never reach into another org's PLC, and org-less legacy PLCs (which the
 *     rule rejects) are never offered.
 *
 * The list itself is read via `usePlcs({ asAdmin: true })` (the whole-/plcs
 * listen admins are authorized for); `adminReassignLead` + `deletePlc` are the
 * two mutators it drives.
 */
export const PlcRecoveryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { isAdmin, orgId } = useAuth();
  const { addToast } = useDashboard();
  // Admin read mode: enumerate every PLC regardless of membership. The mutators
  // used here (`adminReassignLead` / `deletePlc`) are authorized for a
  // non-member admin by the rules layer.
  const { plcs, loading, error, adminReassignLead, deletePlc } = usePlcs({
    asAdmin: true,
  });

  // uid of the PLC whose reassign picker is open (only one at a time), or null.
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  // Selected new-lead uid within the open reassign picker.
  const [selectedLead, setSelectedLead] = useState<string>('');
  // PLC id currently mid-action (reassign or dissolve) so its buttons disable.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Only PLCs in the admin's own org are recoverable (mirrors the rule's
  // `isOrgMember(resource.data.orgId)` + `orgId is string` gate). Org-less
  // legacy PLCs are deliberately excluded.
  const recoverable = useMemo<Plc[]>(() => {
    if (!orgId) return [];
    return plcs.filter((p) => p.orgId === orgId);
  }, [plcs, orgId]);

  // Hidden entirely for non-admins (and while admin status is still resolving)
  // or admins with no org — neither can perform a scoped recovery.
  if (!isAdmin || !orgId) return null;

  const openReassign = (plc: Plc) => {
    const eligible = eligibleNewLeads(plc);
    setReassigningId(plc.id);
    setSelectedLead(eligible[0]?.uid ?? '');
  };

  const closeReassign = () => {
    setReassigningId(null);
    setSelectedLead('');
  };

  const handleReassign = async (plc: Plc) => {
    const member = getPlcMembers(plc).find((m) => m.uid === selectedLead);
    if (!member) return;
    const memberLabel = member.displayName || member.email || member.uid;
    if (
      !window.confirm(
        t('admin.plc.recovery.confirmReassign', {
          defaultValue:
            'Make {{member}} the lead of “{{name}}”? The current lead will be demoted to member.',
          member: memberLabel,
          name: plc.name,
        })
      )
    ) {
      return;
    }
    setBusyId(plc.id);
    try {
      await adminReassignLead(plc.id, selectedLead);
      closeReassign();
      addToast(
        t('admin.plc.recovery.reassignSuccess', {
          defaultValue: '{{member}} is now the lead of “{{name}}”.',
          member: memberLabel,
          name: plc.name,
        }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('admin.plc.recovery.actionFailed', {
              defaultValue:
                "That action couldn't be completed. Please try again.",
            }),
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDissolve = async (plc: Plc) => {
    if (
      !window.confirm(
        t('admin.plc.recovery.confirmDissolve', {
          defaultValue:
            'Dissolve “{{name}}”? This permanently deletes the PLC for all members and cannot be undone.',
          name: plc.name,
        })
      )
    ) {
      return;
    }
    setBusyId(plc.id);
    try {
      await deletePlc(plc.id);
      if (reassigningId === plc.id) closeReassign();
      addToast(
        t('admin.plc.recovery.dissolveSuccess', {
          defaultValue: '“{{name}}” has been dissolved.',
          name: plc.name,
        }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('admin.plc.recovery.actionFailed', {
              defaultValue:
                "That action couldn't be completed. Please try again.",
            }),
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <ShieldAlert
          className="w-5 h-5 text-brand-blue-primary shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {t('admin.plc.recovery.title', { defaultValue: 'PLC Recovery' })}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {t('admin.plc.recovery.subtitle', {
              defaultValue:
                'Reassign the lead or dissolve an abandoned PLC in your organization.',
            })}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        {t('admin.plc.recovery.explainer', {
          defaultValue:
            "Only PLCs in your organization are recoverable. Use this when a PLC's lead has left and can't transfer leadership.",
        })}
      </p>

      {loading ? (
        <p className="text-sm text-slate-400 italic py-2">
          {t('plcDashboard.resources.loadingPlcs', {
            defaultValue: 'Loading PLCs…',
          })}
        </p>
      ) : error ? (
        <p className="text-sm text-brand-red-primary py-2" role="alert">
          {t('plcDashboard.resources.loadPlcsError', {
            defaultValue: "Couldn't load PLCs. Please try again.",
          })}
        </p>
      ) : recoverable.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-2">
          {t('admin.plc.recovery.empty', {
            defaultValue: 'No recoverable PLCs in your organization.',
          })}
        </p>
      ) : (
        <ul
          className="space-y-2"
          aria-label={t('admin.plc.recovery.title', {
            defaultValue: 'PLC Recovery',
          })}
        >
          {recoverable.map((plc) => {
            const members = getPlcMembers(plc);
            const lead = members.find((m) => m.uid === plc.leadUid);
            const leadLabel = lead
              ? lead.displayName || lead.email || lead.uid
              : plc.leadUid;
            const eligible = eligibleNewLeads(plc);
            const isReassigning = reassigningId === plc.id;
            const isBusy = busyId === plc.id;
            return (
              <li
                key={plc.id}
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 text-sm truncate">
                      {plc.name}
                    </p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Crown
                          className="w-3.5 h-3.5 text-amber-500"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-slate-600">
                          {t('admin.plc.recovery.leadLabel', {
                            defaultValue: 'Lead',
                          })}
                          :
                        </span>{' '}
                        {leadLabel}
                      </span>
                      <span className="text-xs text-slate-400">
                        {t('admin.plc.recovery.membersLabel', {
                          defaultValue: `${members.length} members`,
                          count: members.length,
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        isReassigning ? closeReassign() : openReassign(plc)
                      }
                      disabled={isBusy}
                      className="flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:bg-brand-blue-primary/10 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <UserCog className="w-4 h-4" aria-hidden="true" />
                      {t('admin.plc.recovery.reassignLead', {
                        defaultValue: 'Reassign lead',
                      })}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDissolve(plc)}
                      disabled={isBusy}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      {t('admin.plc.recovery.dissolve', {
                        defaultValue: 'Dissolve PLC',
                      })}
                    </button>
                  </div>
                </div>

                {isReassigning && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-600 mb-2">
                      {t('admin.plc.recovery.reassignDescription', {
                        defaultValue:
                          'Choose an active member to become the new lead of “{{name}}”.',
                        name: plc.name,
                      })}
                    </p>
                    {eligible.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        {t('admin.plc.recovery.noEligibleMembers', {
                          defaultValue: 'No other active members to promote.',
                        })}
                      </p>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <label
                          className="sr-only"
                          htmlFor={`new-lead-${plc.id}`}
                        >
                          {t('admin.plc.recovery.newLeadLabel', {
                            defaultValue: 'New lead',
                          })}
                        </label>
                        <select
                          id={`new-lead-${plc.id}`}
                          value={selectedLead}
                          onChange={(e) => setSelectedLead(e.target.value)}
                          disabled={isBusy}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                        >
                          {eligible.map((m) => (
                            <option key={m.uid} value={m.uid}>
                              {m.displayName || m.email || m.uid}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleReassign(plc)}
                          disabled={isBusy || !selectedLead}
                          className="flex items-center gap-1 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                          {t('admin.plc.recovery.confirm', {
                            defaultValue: 'Confirm',
                          })}
                        </button>
                        <button
                          type="button"
                          onClick={closeReassign}
                          disabled={isBusy}
                          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                          {t('admin.plc.recovery.cancel', {
                            defaultValue: 'Cancel',
                          })}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * Active members who could become the new lead — every active member except the
 * sitting lead. Mirrors the `adminReassignLead` / `isAdminManagingPlc`
 * precondition that the new lead is an existing active member distinct from the
 * old one.
 */
function eligibleNewLeads(plc: Plc): PlcMember[] {
  return getPlcMembers(plc).filter((m) => m.uid !== plc.leadUid);
}
