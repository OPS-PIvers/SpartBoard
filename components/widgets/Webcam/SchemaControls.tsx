import React from 'react';
import { WidgetData, WebcamConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { useDashboard } from '@/context/useDashboard';

export const WebcamSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = (widget.config || {}) as WebcamConfig;
  const { autoSendToNotes } = config;

  return (
    <div className="space-y-6 p-1">
      <div className="pt-2">
        <p className="text-xxs font-bold text-slate-500 uppercase tracking-tight mb-2">
          Auto-Send OCR to Notes:
        </p>
        <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-indigo-900">OCR to Notes</p>
            <p className="text-xxxs text-indigo-600 uppercase">
              Instantly convert captured text into a Notes widget.
            </p>
          </div>
          <Toggle
            checked={!!autoSendToNotes}
            onChange={(checked) =>
              updateWidget(widget.id, {
                config: { ...config, autoSendToNotes: checked },
              })
            }
            size="md"
            aria-label="Auto-Send OCR to Notes"
          />
        </div>
      </div>
    </div>
  );
};
