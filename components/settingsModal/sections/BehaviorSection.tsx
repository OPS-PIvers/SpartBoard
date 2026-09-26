/**
 * BehaviorSection — account-wide behavior toggles (close-warning, remote
 * control). These write via updateAccountPreferences and apply to every board,
 * hence the "All boards" scope chip.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { MousePointerClick, ShieldX, SlidersHorizontal } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { Card } from '@/components/common/Card';
import { useAuth } from '@/context/useAuth';
import { SettingsSectionHeader } from '@/components/settingsModal/SettingsSectionHeader';
import { tourAttr } from '@/config/tourAnchors';

export const BehaviorSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    disableCloseConfirmation,
    remoteControlEnabled,
    updateAccountPreferences,
  } = useAuth();

  return (
    <div className="p-5 space-y-5">
      <SettingsSectionHeader
        icon={<SlidersHorizontal className="w-4 h-4" />}
        title={t('sidebar.nav.preferences', { defaultValue: 'Behavior' })}
        scopeLabel={t('settings.scopeAllBoards', {
          defaultValue: 'All boards',
        })}
      />

      <div className="space-y-2">
        {/* Close Warning */}
        <Card className="flex items-start gap-4" hoverable>
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
                anchor={tourAttr('behavior.close-warning-toggle')}
                checked={disableCloseConfirmation}
                onChange={(checked) =>
                  void updateAccountPreferences({
                    disableCloseConfirmation: checked,
                  })
                }
              />
            </div>
          </div>
        </Card>

        {/* Remote Control */}
        <Card className="flex items-start gap-4" hoverable>
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
                anchor={tourAttr('behavior.remote-control-toggle')}
                checked={remoteControlEnabled}
                onChange={(checked) =>
                  void updateAccountPreferences({
                    remoteControlEnabled: checked,
                  })
                }
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
