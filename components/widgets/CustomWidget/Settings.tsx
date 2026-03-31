/**
 * CustomWidgetSettings
 *
 * Settings panel (back face) for the custom widget.
 * Renders admin-configurable settings defined in the CustomWidgetDoc.
 */

import React, { useState } from 'react';
import {
  WidgetData,
  CustomWidgetConfig,
  CustomWidgetSettingDef,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useCustomWidgets } from '@/context/useCustomWidgets';
import { Toggle } from '@/components/common/Toggle';

function buildDefaults(
  defs: CustomWidgetSettingDef[],
  saved: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const def of defs) {
    result[def.key] =
      saved[def.key] ??
      def.defaultValue ??
      (def.type === 'number' ? 0 : def.type === 'boolean' ? false : '');
  }
  return { ...result, ...saved };
}

interface SettingsProps {
  widget: WidgetData;
}

export const CustomWidgetSettings: React.FC<SettingsProps> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const { customWidgets } = useCustomWidgets();
  const config = widget.config as CustomWidgetConfig;
  const adminSettings: Record<string, string | number | boolean> =
    config.adminSettings ?? {};

  // Find the live widget doc to get setting definitions
  const widgetDoc = customWidgets.find((cw) => cw.id === config.customWidgetId);
  const settingDefs: CustomWidgetSettingDef[] = widgetDoc?.settings ?? [];

  // Initialize localValues from adminSettings, falling back to setting defaults
  const [localValues, setLocalValues] = useState<
    Record<string, string | number | boolean>
  >(() => buildDefaults(settingDefs, adminSettings));

  // "Adjusting state while rendering" pattern: re-merge defaults whenever the
  // widget doc changes (async load or switch to a different widget). This avoids
  // calling setState inside an effect, which triggers react-hooks/set-state-in-effect.
  const [prevDocId, setPrevDocId] = useState<string | undefined>(undefined);
  if (prevDocId !== widgetDoc?.id) {
    setPrevDocId(widgetDoc?.id);
    setLocalValues((prev) => buildDefaults(settingDefs, prev));
  }

  const handleChange = (key: string, value: string | number | boolean) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        adminSettings: localValues,
      },
    });
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-auto">
      <div>
        <h3 className="text-white font-semibold text-base mb-1">
          Custom Widget
        </h3>
        <p className="text-slate-400 text-sm">
          Widget ID:{' '}
          <span className="font-mono text-slate-300 text-xs">
            {config.customWidgetId}
          </span>
        </p>
      </div>

      {settingDefs.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-slate-200 font-medium text-sm">Settings</h4>
          {settingDefs.map((def) => {
            const val = localValues[def.key];
            return (
              <div key={def.key} className="flex flex-col gap-1">
                <label className="text-slate-300 text-sm font-medium">
                  {def.label ?? def.key}
                </label>
                {def.type === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle
                      checked={Boolean(val)}
                      onChange={(checked) => handleChange(def.key, checked)}
                    />
                    <span className="text-slate-400 text-xs">
                      {val ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                ) : def.type === 'number' ? (
                  <input
                    type="number"
                    value={String(val ?? 0)}
                    onChange={(e) =>
                      handleChange(def.key, parseFloat(e.target.value) || 0)
                    }
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                  />
                ) : def.type === 'select' ? (
                  <select
                    value={String(
                      def.options?.includes(String(val))
                        ? val
                        : (def.defaultValue ?? '')
                    )}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                  >
                    {(def.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(val ?? '')}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                  />
                )}
              </div>
            );
          })}
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 text-sm font-medium transition-colors self-start mt-1"
          >
            Save Settings
          </button>
        </div>
      ) : (
        <div className="text-slate-400 text-sm">
          This custom widget has no configurable settings.
        </div>
      )}
    </div>
  );
};
