import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TextConfig } from '@/types';
import { sanitizeHtml } from '@/utils/security';
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from 'lucide-react';

import { SettingsLabel } from '@/components/common/SettingsLabel';
import { TypographySettings } from '@/components/common/TypographySettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { TEXT_WIDGET_COLORS, TEXT_WIDGET_TEMPLATES } from './constants';

export const TextSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as TextConfig;

  const applyTemplate = (content: string) => {
    updateWidget(widget.id, {
      config: { ...config, content: sanitizeHtml(content) } as TextConfig,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel>Templates</SettingsLabel>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_WIDGET_TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => applyTemplate(t.content)}
              className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg text-left hover:bg-slate-50 transition-all"
            >
              <t.icon className="w-3 h-3 text-indigo-600" />
              <span className="text-xxs  text-slate-800">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TextAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as TextConfig;

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel>Background Color</SettingsLabel>
        <div className="flex gap-2">
          {TEXT_WIDGET_COLORS.map((c) => (
            <button
              key={c.hex}
              aria-label={`Select ${c.label} background`}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, bgColor: c.hex } as TextConfig,
                })
              }
              className={`w-8 h-8 rounded-full border-2 transition-all ${config.bgColor === c.hex ? 'border-blue-600 scale-110 shadow-md' : 'border-transparent'}`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>

      <TextSizePresetSettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: {
              ...config,
              ...updates,
            } as TextConfig,
          })
        }
      />

      <div>
        <SettingsLabel>Font Size (Fine Tune)</SettingsLabel>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="12"
            max="48"
            value={config.fontSize}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  fontSize: parseInt(e.target.value),
                } as TextConfig,
              })
            }
            className="flex-1 accent-blue-600"
            aria-label="Font size slider"
          />
          <span className="w-8 text-center font-mono text-slate-700 text-xs">
            {config.fontSize}
          </span>
        </div>
      </div>

      <div>
        <SettingsLabel>Vertical Alignment</SettingsLabel>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              value: 'top',
              label: 'Top',
              icon: AlignVerticalJustifyStart,
            },
            {
              value: 'center',
              label: 'Middle',
              icon: AlignVerticalJustifyCenter,
            },
            {
              value: 'bottom',
              label: 'Bottom',
              icon: AlignVerticalJustifyEnd,
            },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    verticalAlign: option.value as TextConfig['verticalAlign'],
                  } as TextConfig,
                })
              }
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                (config.verticalAlign ?? 'top') === option.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <option.icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <TypographySettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates },
          })
        }
      />
    </div>
  );
};
