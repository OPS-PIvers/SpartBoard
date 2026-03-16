import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, RevealGridConfig } from '@/types';

// The wrapper WidgetRenderer uses SettingsPanel and passes Settings in as a prop
// So this file just renders the configuration UI inside the Settings panel
export const RevealGridSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as RevealGridConfig;

  // Real implementation would have a form here to add/edit/delete cards
  return (
    <div className="p-4">
      <p className="text-sm text-gray-500 mb-4">
        Settings configuration for Reveal Grid widget.
      </p>
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-700">Columns</label>
        <select
          value={config.columns ?? 3}
          onChange={(e) =>
            updateWidget(widget.id, {
              config: {
                ...config,
                columns: parseInt(
                  e.target.value
                ) as RevealGridConfig['columns'],
              },
            })
          }
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
          <option value={5}>5</option>
        </select>
      </div>
    </div>
  );
};
