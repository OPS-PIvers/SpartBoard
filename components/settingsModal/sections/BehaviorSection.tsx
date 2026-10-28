/**
 * BehaviorSection — account-wide behavior toggles (close-warning, alignment
 * guides, spell check, remote control, Sparty). These write via updateAccountPreferences and apply to every board,
 * hence the "All boards" scope chip.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  MousePointerClick,
  Ruler,
  ShieldX,
  SlidersHorizontal,
  SpellCheck,
} from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { Card } from '@/components/common/Card';
import { useAuth } from '@/context/useAuth';
import { SettingsSectionHeader } from '@/components/settingsModal/SettingsSectionHeader';
import { tourAttr } from '@/config/tourAnchors';
import { Sparty } from '@/components/sparty/Sparty';

export const BehaviorSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    disableCloseConfirmation,
    alignmentGuidesEnabled,
    spellCheckEnabled,
    remoteControlEnabled,
    spartyEnabled,
    canAccessFeature,
    updateAccountPreferences,
  } = useAuth();
  const spartyLabel = t('sidebar.settings.showSparty', {
    defaultValue: 'Show Sparty',
  });
  const alignmentGuidesLabel = t('sidebar.settings.alignmentGuides', {
    defaultValue: 'Alignment guides',
  });
  const spellCheckLabel = t('sidebar.settings.spellCheck', {
    defaultValue: 'Spell check',
  });

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

        {canAccessFeature('alignment-guides') && (
          <Card className="flex items-start gap-4" hoverable>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Ruler className="w-[18px] h-[18px] text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">
                  {alignmentGuidesLabel}
                </span>
                <Toggle
                  size="sm"
                  label={alignmentGuidesLabel}
                  anchor={tourAttr('behavior.alignment-guides-toggle')}
                  checked={alignmentGuidesEnabled}
                  onChange={(checked) =>
                    void updateAccountPreferences({
                      alignmentGuidesEnabled: checked,
                    })
                  }
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('sidebar.settings.alignmentGuidesHint', {
                  defaultValue:
                    'Lines show when a widget lines up with others or is evenly spaced.',
                })}
              </p>
            </div>
          </Card>
        )}

        {canAccessFeature('spell-check-setting') && (
          <Card className="flex items-start gap-4" hoverable>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <SpellCheck className="w-[18px] h-[18px] text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">
                  {spellCheckLabel}
                </span>
                <Toggle
                  size="sm"
                  label={spellCheckLabel}
                  anchor={tourAttr('behavior.spell-check-toggle')}
                  checked={spellCheckEnabled}
                  onChange={(checked) =>
                    void updateAccountPreferences({
                      spellCheckEnabled: checked,
                    })
                  }
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('sidebar.settings.spellCheckHint', {
                  defaultValue: 'Underline misspelled words as you type.',
                })}
              </p>
            </div>
          </Card>
        )}

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

        {canAccessFeature('sparty') && (
          <Card className="flex items-start gap-4" hoverable>
            <Sparty
              pose="idle"
              size={32}
              decorative
              className="flex-shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">
                  {spartyLabel}
                </span>
                <Toggle
                  size="sm"
                  label={spartyLabel}
                  checked={spartyEnabled}
                  onChange={(checked) =>
                    void updateAccountPreferences({ spartyEnabled: checked })
                  }
                />
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
