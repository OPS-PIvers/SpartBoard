import React, { useState, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TextConfig } from '@/types';
import { sanitizeHtml } from '@/utils/security';
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Minus,
  Plus,
} from 'lucide-react';

import { SettingsLabel } from '@/components/common/SettingsLabel';
import { TypographySettings } from '@/components/common/TypographySettings';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';
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
  const baseFontSize = config.fontSize ?? 18;

  // Resolve the effective font size (base * preset multiplier) so the
  // displayed value matches what the user actually sees on screen.
  const resolvedFontSize = Math.round(
    baseFontSize * resolveTextPresetMultiplier(config.textSizePreset, 1)
  );

  const [localSize, setLocalSize] = useState(resolvedFontSize);
  const [fontSizeInput, setFontSizeInput] = useState(String(resolvedFontSize));

  // Sync local state when config changes externally
  useEffect(() => {
    setLocalSize(resolvedFontSize);
    setFontSizeInput(String(resolvedFontSize));
  }, [resolvedFontSize]);

  const commitFontSize = (value: number) => {
    const clamped = Math.max(8, Math.min(96, value));
    setLocalSize(clamped);
    setFontSizeInput(String(clamped));
    const nextConfig: TextConfig = {
      ...config,
      fontSize: clamped,
    };
    delete nextConfig.textSizePreset;
    updateWidget(widget.id, {
      config: nextConfig,
    });
  };

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

      <div>
        <SettingsLabel>Font Size</SettingsLabel>
        <div className="flex items-center gap-2">
          <button
            onClick={() => commitFontSize(localSize - 1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
            aria-label="Decrease font size"
          >
            <Minus className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <input
            type="text"
            value={fontSizeInput}
            onChange={(e) => setFontSizeInput(e.target.value)}
            onBlur={() => {
              const val = parseInt(fontSizeInput, 10);
              if (!Number.isNaN(val)) {
                commitFontSize(val);
              } else {
                setFontSizeInput(String(localSize));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = parseInt(fontSizeInput, 10);
                if (!Number.isNaN(val)) {
                  commitFontSize(val);
                } else {
                  setFontSizeInput(String(localSize));
                }
              }
            }}
            className="w-12 h-8 text-center font-mono text-sm text-slate-700 border border-slate-200 rounded-lg bg-white outline-none focus:border-blue-400"
            aria-label="Font size"
          />
          <button
            onClick={() => commitFontSize(localSize + 1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
            aria-label="Increase font size"
          >
            <Plus className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <span className="text-xs text-slate-500">px</span>
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
