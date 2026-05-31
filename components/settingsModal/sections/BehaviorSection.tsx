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
        description={t('sidebar.settings.preferencesDescription', {
          defaultValue:
            'Customize how your boards behave. These settings apply to your account across all boards.',
        })}
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
                checked={disableCloseConfirmation}
                onChange={(checked) =>
                  void updateAccountPreferences({
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
                checked={remoteControlEnabled}
                onChange={(checked) =>
                  void updateAccountPreferences({
                    remoteControlEnabled: checked,
                  })
                }
              />
            </div>
            <p className="text-xxs text-slate-500 mt-1 leading-relaxed pr-2">
              {t('sidebar.settings.remoteControlDescription', {
                defaultValue:
                  'Allow controlling your boards remotely from another device.',
              })}
            </p>
          </div>
        </Card>
      </div>

      <div className="px-3 py-3 bg-brand-blue-lighter/30 rounded-xl border border-brand-blue-lighter">
        <p className="text-xxs text-brand-blue-primary leading-relaxed">
          <span className="font-bold">
            {t('sidebar.settings.tip', { defaultValue: 'Tip:' })}
          </span>{' '}
          {t('sidebar.settings.preferencesTip', {
            defaultValue:
              'These preferences are saved to your account and apply to all your boards.',
          })}
        </p>
      </div>
    </div>
  );
};
