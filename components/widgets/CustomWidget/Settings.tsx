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

interface SettingsProps {
  widget: WidgetData;
}

export const CustomWidgetSettings: React.FC<SettingsProps> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as CustomWidgetConfig;
  const adminSettings: Record<string, string | number | boolean> =
    config.adminSettings ?? {};

  // We don't have the live doc here, but we can show settings if they were
  // snapshotted into the config. For a live experience the Widget.tsx has the
  // full doc, but the settings panel only needs the persisted values.
  // If there are no setting defs available we fall back to a simple message.

  // Pull setting defs from the widget doc snapshot if present.
  // (The builder stores them at the top level of config for convenience.)
  const settingDefs: CustomWidgetSettingDef[] =
    (config as unknown as { _settingDefs?: CustomWidgetSettingDef[] })
      ._settingDefs ?? [];

  const [localValues, setLocalValues] =
    useState<Record<string, string | number | boolean>>(adminSettings);

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
        <p className="text-slate-400 text-sm mt-1">
          Mode: <span className="text-slate-200 capitalize">{config.mode}</span>
        </p>
      </div>

      {settingDefs.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-slate-200 font-medium text-sm">Settings</h4>
          {settingDefs.map((def) => {
            const currentValue = localValues[def.key] ?? def.defaultValue;
            return (
              <div key={def.key} className="flex flex-col gap-1">
                <label className="text-slate-300 text-sm font-medium">
                  {def.label}
                </label>

                {def.type === 'boolean' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(currentValue)}
                      onChange={(e) => handleChange(def.key, e.target.checked)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-slate-400 text-xs">
                      {currentValue ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                )}

                {def.type === 'number' && (
                  <input
                    type="number"
                    value={String(currentValue)}
                    onChange={(e) =>
                      handleChange(def.key, parseFloat(e.target.value) || 0)
                    }
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                  />
                )}

                {def.type === 'string' && (
                  <input
                    type="text"
                    value={String(currentValue)}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                  />
                )}

                {def.type === 'select' && def.options && (
                  <select
                    value={String(currentValue)}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                  >
                    {def.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
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
