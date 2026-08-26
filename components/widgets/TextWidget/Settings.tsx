import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TextConfig } from '@/types';
import { sanitizeHtml } from '@/utils/security';

import { SettingsLabel } from '@/components/common/SettingsLabel';
import { TypographySettings } from '@/components/common/TypographySettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { TEXT_WIDGET_TEMPLATES } from './constants';

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
        <SettingsLabel
          as="span"
          id={`text-widget-templates-label-${widget.id}`}
        >
          Templates
        </SettingsLabel>
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-labelledby={`text-widget-templates-label-${widget.id}`}
        >
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
      <TextSizePresetSettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as TextConfig,
          })
        }
      />
      <TypographySettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as TextConfig,
          })
        }
      />
    </div>
  );
};
