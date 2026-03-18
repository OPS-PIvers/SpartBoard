import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, QRConfig } from '@/types';
import { Link, AlertCircle } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';

export const QRSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as QRConfig;

  const hasTextWidget = activeDashboard?.widgets.some((w) => w.type === 'text');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">
          Destination URL
        </label>
        <input
          type="text"
          value={config.url ?? ''}
          onChange={(e) =>
            updateWidget(widget.id, {
              config: { ...config, url: e.target.value } as QRConfig,
            })
          }
          disabled={config.syncWithTextWidget}
          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400 transition-all"
          placeholder="https://..."
        />
      </div>

      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-indigo-900">
          <Link className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Link Repeater
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-indigo-800">Sync with Text Widget</span>
          <Toggle
            checked={config.syncWithTextWidget ?? false}
            onChange={(checked: boolean) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  syncWithTextWidget: checked,
                } as QRConfig,
              })
            }
            size="sm"
            activeColor="bg-indigo-600"
            showLabels={false}
          />
        </div>

        {config.syncWithTextWidget && !hasTextWidget && (
          <div className="flex gap-2 items-start text-orange-600 bg-orange-50 p-2 rounded-lg border border-orange-100">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong>No Text Widget found!</strong>
              <br />
              Add a Text Widget to the dashboard to start syncing.
            </div>
          </div>
        )}

        <div className="text-xxs text-indigo-400 font-medium leading-relaxed">
          Automatically updates the QR code to match the content of the first
          Text Widget on your dashboard.
        </div>
      </div>
    </div>
  );
};
