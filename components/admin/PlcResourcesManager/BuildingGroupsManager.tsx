import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcs } from '@/hooks/usePlcs';
import { useOrgBuildings } from '@/hooks/useOrgBuildings';
import {
  callCreateBuildingGroup,
  callSyncBuildingGroup,
} from '@/hooks/useBuildingGroups';
import { getPlcMembers } from '@/utils/plc';
import { getPlcGroupType } from '@/types';

const inputClass =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary';
const labelClass =
  'block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5';

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Admin list and create form for whole-building groups. */
export const BuildingGroupsManager: React.FC = () => {
  const { t } = useTranslation();
  const { orgId } = useAuth();
  const { addToast } = useDashboard();
  const { plcs, loading } = usePlcs({ asAdmin: true });
  const { buildings } = useOrgBuildings(orgId);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [coLeads, setCoLeads] = useState('');
  const [autoRoster, setAutoRoster] = useState(true);

  const groups = useMemo(
    () =>
      plcs.filter(
        (p) => getPlcGroupType(p) === 'building' && p.orgId === orgId
      ),
    [plcs, orgId]
  );
  const buildingName = (id: string | null | undefined) =>
    buildings.find((b) => b.id === id)?.name ?? id ?? '';

  const resetForm = () => {
    setShowForm(false);
    setName('');
    setBuildingId('');
    setLeadEmail('');
    setCoLeads('');
    setAutoRoster(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setBusyId('new');
    try {
      const { added } = await callCreateBuildingGroup({
        orgId,
        buildingId,
        name: name.trim(),
        leadEmail: leadEmail.trim(),
        coLeadEmails: coLeads
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        autoRoster,
      });
      addToast(
        t('admin.buildingGroups.created', {
          count: added,
          defaultValue: 'Group created. {{count}} staff added.',
        }),
        'success'
      );
      resetForm();
    } catch (err) {
      addToast(
        errorText(
          err,
          t('admin.buildingGroups.createFailed', {
            defaultValue: "Couldn't create the group.",
          })
        ),
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSync = async (plcId: string, nextAutoRoster?: boolean) => {
    setBusyId(plcId);
    try {
      const { added } = await callSyncBuildingGroup({
        plcId,
        autoRoster: nextAutoRoster,
      });
      addToast(
        t('admin.buildingGroups.synced', {
          count: added,
          defaultValue: '{{count}} staff added.',
        }),
        'success'
      );
    } catch (err) {
      addToast(
        errorText(
          err,
          t('admin.buildingGroups.syncFailed', {
            defaultValue: "Couldn't update the group.",
          })
        ),
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const canCreate =
    !!orgId && !!name.trim() && !!buildingId && !!leadEmail.trim();

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">
          {t('admin.buildingGroups.title', {
            defaultValue: 'Building groups',
          })}
        </h3>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={!orgId}
            className="flex items-center gap-1.5 bg-brand-blue-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('admin.buildingGroups.new', {
              defaultValue: 'New building group',
            })}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="grid gap-4 sm:grid-cols-2 border-b border-slate-200 pb-6"
        >
          <div>
            <label htmlFor="bg-name" className={labelClass}>
              {t('admin.buildingGroups.name', { defaultValue: 'Name' })}
            </label>
            <input
              id="bg-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.buildingGroups.namePlaceholder', {
                defaultValue: 'e.g. Intermediate Staff',
              })}
            />
          </div>
          <div>
            <label htmlFor="bg-building" className={labelClass}>
              {t('admin.buildingGroups.building', {
                defaultValue: 'Building',
              })}
            </label>
            <select
              id="bg-building"
              className={inputClass}
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
            >
              <option value="">
                {t('admin.buildingGroups.pickBuilding', {
                  defaultValue: 'Choose a building',
                })}
              </option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bg-lead" className={labelClass}>
              {t('admin.buildingGroups.lead', { defaultValue: 'Lead email' })}
            </label>
            <input
              id="bg-lead"
              type="email"
              className={inputClass}
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="bg-coleads" className={labelClass}>
              {t('admin.buildingGroups.coLeads', {
                defaultValue: 'Co-lead emails',
              })}
            </label>
            <input
              id="bg-coleads"
              className={inputClass}
              value={coLeads}
              onChange={(e) => setCoLeads(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={autoRoster}
              onChange={(e) => setAutoRoster(e.target.checked)}
              className="h-4 w-4 accent-brand-blue-primary"
            />
            {t('admin.buildingGroups.autoRoster', {
              defaultValue: 'Add staff who sign in with this building',
            })}
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="submit"
              disabled={!canCreate || busyId === 'new'}
              className="bg-brand-blue-primary text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
            >
              {t('admin.buildingGroups.create', {
                defaultValue: 'Create group',
              })}
            </button>
          </div>
        </form>
      )}

      {loading ? null : groups.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('admin.buildingGroups.empty', {
            defaultValue: 'No building groups yet.',
          })}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {groups.map((g) => {
            const busy = busyId === g.id;
            const on = g.autoRoster === true;
            return (
              <li key={g.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {g.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {buildingName(g.buildingId)} ·{' '}
                    {t('admin.buildingGroups.memberCount', {
                      count: getPlcMembers(g).length,
                      defaultValue: '{{count}} members',
                    })}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={() => void handleSync(g.id, !on)}
                    className="h-4 w-4 accent-brand-blue-primary"
                  />
                  {t('admin.buildingGroups.autoRosterShort', {
                    defaultValue: 'Auto-add staff',
                  })}
                </label>
                <button
                  type="button"
                  onClick={() => void handleSync(g.id)}
                  disabled={busy || !on}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-slate-100 disabled:opacity-40"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {t('admin.buildingGroups.sync', {
                    defaultValue: 'Add staff now',
                  })}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
