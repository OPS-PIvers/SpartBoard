/**
 * CustomWidgetSettings
 *
 * Settings panel (back face) for the custom widget.
 * Renders admin-configurable settings defined in the CustomWidgetDoc.
 */

import React, { useState } from 'react';
import { WidgetData, CustomWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface SettingsProps {
  widget: WidgetData;
}

export const CustomWidgetSettings: React.FC<SettingsProps> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as CustomWidgetConfig;
  const adminSettings: Record<string, string | number | boolean> =
    config.adminSettings ?? {};

  // The settings panel renders admin-configurable values stored in adminSettings.
  // Widget definition (gridDefinition, mode, etc.) is loaded live in Widget.tsx.

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
      </div>

      {Object.keys(adminSettings).length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-slate-200 font-medium text-sm">Settings</h4>
          {Object.entries(adminSettings).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-slate-300 text-sm font-medium">
                {key}
              </label>
              {typeof value === 'boolean' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(localValues[key] ?? value)}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-slate-400 text-xs">
                    {localValues[key] ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              ) : typeof value === 'number' ? (
                <input
                  type="number"
                  value={String(localValues[key] ?? value)}
                  onChange={(e) =>
                    handleChange(key, parseFloat(e.target.value) || 0)
                  }
                  className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                />
              ) : (
                <input
                  type="text"
                  value={String(localValues[key] ?? value)}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-blue-400"
                />
              )}
            </div>
          ))}

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
