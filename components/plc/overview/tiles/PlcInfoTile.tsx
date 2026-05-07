import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, Users2 } from 'lucide-react';
import { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface PlcInfoTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

export const PlcInfoTile: React.FC<PlcInfoTileProps> = ({
  plc,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isLead = plc.leadUid === user?.uid;
  const leadEmail = plc.memberEmails[plc.leadUid] ?? '';

  const formatDate = (ms: number) => {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-blue-lighter flex items-center justify-center">
          <Users2 className="w-5 h-5 text-brand-blue-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-bold text-slate-900 truncate">
            {plc.name}
          </h4>
          <p className="text-xxs text-slate-400 uppercase tracking-widest font-bold mt-0.5">
            {t('plcDashboard.overview.tiles.plcInfo.label', {
              defaultValue: 'Professional Learning Community',
            })}
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-xs flex-1">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">
            {t('plcDashboard.overview.tiles.plcInfo.members', {
              defaultValue: 'Members',
            })}
          </dt>
          <dd className="font-bold text-slate-800">{plc.memberUids.length}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">
            {t('plcDashboard.overview.tiles.plcInfo.lead', {
              defaultValue: 'Lead',
            })}
          </dt>
          <dd className="font-semibold text-slate-700 truncate ml-2">
            {isLead
              ? t('plcDashboard.overview.tiles.plcInfo.you', {
                  defaultValue: 'You',
                })
              : leadEmail || '—'}
          </dd>
        </div>
        {plc.createdAt > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">
              {t('plcDashboard.overview.tiles.plcInfo.created', {
                defaultValue: 'Created',
              })}
            </dt>
            <dd className="font-semibold text-slate-700">
              {formatDate(plc.createdAt)}
            </dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={() => onNavigateTab('settings')}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-brand-blue-lighter hover:text-brand-blue-primary text-slate-600 text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors self-start"
      >
        <SettingsIcon className="w-3.5 h-3.5" />
        {t('plcDashboard.overview.tiles.plcInfo.openSettings', {
          defaultValue: 'Open settings',
        })}
      </button>
    </div>
  );
};
