import React from 'react';
import { AlignVerticalSpaceAround } from 'lucide-react';
import { WidgetData, WorkSymbolsConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { TypographySettings } from '@/components/common/TypographySettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const WorkSymbolsSettings: React.FC<{ widget: WidgetData }> = () => null;

export const WorkSymbolsAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as WorkSymbolsConfig;

  const updateConfig = (updates: Partial<WorkSymbolsConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  const titlePosition = config.titlePosition ?? 'bottom';

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <TextSizePresetSettings config={config} updateConfig={updateConfig} />

      <div>
        <SettingsLabel icon={AlignVerticalSpaceAround}>
          Title Position
        </SettingsLabel>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => updateConfig({ titlePosition: 'bottom' })}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              titlePosition === 'bottom'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Bottom
          </button>
          <button
            onClick={() => updateConfig({ titlePosition: 'top' })}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              titlePosition === 'top'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Top
          </button>
        </div>
      </div>
    </div>
  );
};
