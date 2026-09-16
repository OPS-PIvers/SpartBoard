/**
 * WidgetDefaultsSection — review and clear the "my default" appearance saved
 * per widget type from a widget's Style tab (D28). Account-wide.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shapes, X } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useToolLabel } from '@/hooks/useToolLabel';
import { TOOLS } from '@/config/tools';
import { FONTS } from '@/config/fonts';
import {
  FONT_COLOR_PRESETS,
  NOTE_COLOR_PRESETS,
  TEXT_SIZE_PRESETS,
  WINDOW_BACKGROUND_PRESETS,
} from '@/config/widgetAppearance';
import { pickAppearanceKeys } from '@/utils/widgetConfigPersistence';
import { resolveLabel } from '@/components/settings/renderer/resolveLabel';
import { SettingsSectionHeader } from '@/components/settingsModal/SettingsSectionHeader';
import type { WidgetConfig, WidgetType } from '@/types';

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// Text's note color names its sticky tints; other keys try the drawer's color sets.
const colorName = (key: string, hex: string): string | undefined => {
  const sets =
    key === 'bgColor'
      ? [NOTE_COLOR_PRESETS]
      : [FONT_COLOR_PRESETS, WINDOW_BACKGROUND_PRESETS];
  const lower = hex.toLowerCase();
  for (const set of sets) {
    const match = set.find((preset) => preset.hex.toLowerCase() === lower);
    if (match) return match.name;
  }
  return undefined;
};

function formatValue(key: string, value: unknown): string {
  if (key === 'fontFamily') {
    return FONTS.find((font) => font.id === value)?.label ?? String(value);
  }
  if (key === 'textSizePreset') {
    return (
      TEXT_SIZE_PRESETS.find((preset) => preset.id === value)?.label ??
      String(value)
    );
  }
  if (typeof value === 'string' && HEX_RE.test(value)) {
    return colorName(key, value) ?? value;
  }
  if (typeof value === 'number' && key === 'cardOpacity') {
    return `${Math.round(value * 100)}%`;
  }
  if (typeof value === 'number' && key === 'scaleMultiplier') {
    return `${value}×`;
  }
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : JSON.stringify(value);
}

export const WidgetDefaultsSection: React.FC = () => {
  const { t } = useTranslation();
  const { savedWidgetConfigs, saveWidgetDefault } = useAuth();
  const toolLabel = useToolLabel();

  const entries = (
    Object.entries(savedWidgetConfigs) as [
      WidgetType,
      Partial<WidgetConfig> | undefined,
    ][]
  )
    .map(
      ([type, config]) =>
        [
          type,
          pickAppearanceKeys(config ?? {}) as Record<string, unknown>,
        ] as const
    )
    .filter(([, config]) =>
      Object.values(config).some((value) => value !== undefined)
    )
    .sort(([a], [b]) => toolLabel(a).localeCompare(toolLabel(b)));

  const removeKey = (
    type: WidgetType,
    config: Record<string, unknown>,
    key: string
  ) => {
    const { [key]: _removed, ...rest } = config;
    saveWidgetDefault(type, rest as Partial<WidgetConfig>);
  };

  return (
    <div className="p-5">
      <SettingsSectionHeader
        icon={<Shapes className="w-4 h-4" />}
        title={t('settings.widgetDefaults.title', {
          defaultValue: 'Widget defaults',
        })}
        description={t('settings.widgetDefaults.description', {
          defaultValue:
            'The look new widgets start with. Save one from a widget’s Style tab. Clearing a default does not change widgets already on your boards.',
        })}
        scopeLabel={t('settings.scopeAllBoards', {
          defaultValue: 'All boards',
        })}
      />

      {entries.length === 0 ? (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
          {t('settings.widgetDefaults.empty', {
            defaultValue:
              'No widget defaults yet. Open a widget’s settings, go to Style, and choose Save as my default.',
          })}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map(([type, config]) => {
            const tool = TOOLS.find((candidate) => candidate.type === type);
            const Icon = tool?.icon;
            const name = toolLabel(type) || type;
            return (
              <li
                key={type}
                data-testid={`widget-default-${type}`}
                className="border border-slate-200 rounded-xl p-3"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ${tool?.color ?? 'bg-slate-500'}`}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 truncate">
                    {name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => saveWidgetDefault(type, {})}
                    aria-label={t('settings.widgetDefaults.clearLabel', {
                      defaultValue: 'Clear {{name}} default',
                      name,
                    })}
                    className="ml-auto text-xs font-bold text-brand-blue-primary hover:text-brand-blue-dark px-2 py-1 rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                  >
                    {t('settings.widgetDefaults.clearAll', {
                      defaultValue: 'Clear',
                    })}
                  </button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {Object.entries(config)
                    .filter(([, value]) => value !== undefined)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => {
                      const keyLabel = resolveLabel(t, type, `style.${key}`);
                      const text = formatValue(key, value);
                      const isColor =
                        typeof value === 'string' && HEX_RE.test(value);
                      return (
                        <li
                          key={key}
                          className="flex items-center gap-1.5 bg-slate-100 rounded-full pl-2.5 pr-1 py-0.5 text-xs text-slate-700"
                        >
                          <span className="font-semibold">{keyLabel}</span>
                          {isColor && (
                            <span
                              aria-hidden="true"
                              className="w-3 h-3 rounded-full border border-slate-300"
                              style={{ backgroundColor: value }}
                            />
                          )}
                          <span>{text}</span>
                          <button
                            type="button"
                            onClick={() => removeKey(type, config, key)}
                            aria-label={t('settings.widgetDefaults.remove', {
                              defaultValue: 'Remove {{setting}} from {{name}}',
                              setting: keyLabel,
                              name,
                            })}
                            className="p-0.5 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
