import React from 'react';
import { AlignVerticalSpaceAround } from 'lucide-react';
import { WidgetData, WorkSymbolsConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { TypographySettings } from '@/components/common/TypographySettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';

const TITLE_POSITION_OPTIONS: Array<'bottom' | 'top'> = ['bottom', 'top'];

export const WorkSymbolsSettings: React.FC<{ widget: WidgetData }> = () => null;

export const WorkSymbolsAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as WorkSymbolsConfig;

  const updateConfig = (updates: Partial<WorkSymbolsConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  const titlePosition = config.titlePosition ?? 'bottom';

  // Shared select handler — reused by the onClick and roving-tabindex keydown paths.
  const selectTitlePosition = (position: 'bottom' | 'top') =>
    updateConfig({ titlePosition: position });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <TextSizePresetSettings config={config} updateConfig={updateConfig} />

      <div>
        <SettingsLabel
          as="span"
          id={`worksymbols-title-position-label-${widget.id}`}
          icon={AlignVerticalSpaceAround}
        >
          Title Position
        </SettingsLabel>
        <div
          className="flex bg-slate-100 p-1 rounded-xl"
          role="radiogroup"
          aria-labelledby={`worksymbols-title-position-label-${widget.id}`}
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(
              e,
              TITLE_POSITION_OPTIONS,
              selectTitlePosition
            )
          }
        >
          <button
            type="button"
            role="radio"
            aria-checked={titlePosition === 'bottom'}
            tabIndex={titlePosition === 'bottom' ? 0 : -1}
            onClick={() => selectTitlePosition('bottom')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              titlePosition === 'bottom'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Bottom
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={titlePosition === 'top'}
            tabIndex={titlePosition === 'top' ? 0 : -1}
            onClick={() => selectTitlePosition('top')}
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
