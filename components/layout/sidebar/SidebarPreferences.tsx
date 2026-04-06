import React from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, ShieldX, MousePointerClick } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { useDashboard } from '@/context/useDashboard';

interface SidebarPreferencesProps {
  isVisible: boolean;
}

export const SidebarPreferences: React.FC<SidebarPreferencesProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const { activeDashboard, updateDashboardSettings } = useDashboard();

  return (
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
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <SlidersHorizontal className="w-4 h-4 text-slate-500" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                {t('sidebar.nav.preferences', {
                  defaultValue: 'Preferences',
                })}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {t('sidebar.settings.preferencesDescription', {
                defaultValue:
                  'Customize how your board behaves. These settings apply to the current board.',
              })}
            </p>
          </div>

          {/* Preference Items */}
          <div className="space-y-2">
            {/* Close Warning Toggle */}
            <div className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldX className="w-[18px] h-[18px] text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-700">
                    {t('sidebar.settings.disableCloseWarning', {
                      defaultValue: 'Disable Close Warning',
                    })}
                  </span>
                  <Toggle
                    size="sm"
                    checked={
                      activeDashboard?.settings?.disableCloseConfirmation ??
                      false
                    }
                    onChange={(checked) =>
                      updateDashboardSettings({
                        disableCloseConfirmation: checked,
                      })
                    }
                  />
                </div>
                <p className="text-xxs text-slate-500 mt-1 leading-relaxed pr-2">
                  {t('sidebar.settings.skipConfirmation', {
                    defaultValue:
                      'Skip the confirmation dialog when closing widgets.',
                  })}
                </p>
              </div>
            </div>

            {/* Remote Control Toggle */}
            <div className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MousePointerClick className="w-[18px] h-[18px] text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-700">
                    {t('sidebar.settings.remoteControl', {
                      defaultValue: 'Remote Control',
                    })}
                  </span>
                  <Toggle
                    size="sm"
                    checked={
                      activeDashboard?.settings?.remoteControlEnabled ?? false
                    }
                    onChange={(checked) =>
                      updateDashboardSettings({
                        remoteControlEnabled: checked,
                      })
                    }
                  />
                </div>
                <p className="text-xxs text-slate-500 mt-1 leading-relaxed pr-2">
                  {t('sidebar.settings.remoteControlDescription', {
                    defaultValue:
                      'Allow controlling this board remotely from another device.',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div className="px-3 py-3 bg-brand-blue-lighter/30 rounded-xl border border-brand-blue-lighter">
            <p className="text-xxs text-brand-blue-primary leading-relaxed">
              <span className="font-bold">
                {t('sidebar.settings.tip', { defaultValue: 'Tip:' })}
              </span>{' '}
              {t('sidebar.settings.preferencesTip', {
                defaultValue:
                  'These preferences are saved per board. Switch boards to configure them independently.',
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
