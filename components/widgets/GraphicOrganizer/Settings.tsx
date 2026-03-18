import React from 'react';
import { WidgetData, GraphicOrganizerConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

import { GlobalFontFamily } from '@/types';

export const GraphicOrganizerSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as GraphicOrganizerConfig;

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        templateType: e.target.value as GraphicOrganizerConfig['templateType'],
      },
    });
  };

  return (
    <div className="p-4 space-y-4 text-slate-800">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Template Type</label>
        <select
          value={config.templateType}
          onChange={handleTemplateChange}
          className="w-full p-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="frayer">Frayer Model</option>
          <option value="t-chart">T-Chart</option>
          <option value="venn">Venn Diagram</option>
          <option value="kwl">KWL Chart</option>
          <option value="cause-effect">Cause & Effect</option>
        </select>
      </div>
    </div>
  );
};

export const GraphicOrganizerAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as GraphicOrganizerConfig;

  return (
    <div className="p-4 space-y-4 text-slate-800">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Font Family</label>
        <select
          value={config.fontFamily ?? 'global'}
          onChange={(e) =>
            updateWidget(widget.id, {
              config: {
                ...config,
                fontFamily:
                  e.target.value === 'global'
                    ? undefined
                    : (e.target.value as GlobalFontFamily),
              },
            })
          }
          className="w-full p-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="global">Use Dashboard Default</option>
          <option value="sans">Sans Serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
          <option value="comic">Comic</option>
          <option value="handwritten">Handwritten</option>
          <option value="rounded">Rounded</option>
          <option value="fun">Fun</option>
          <option value="slab">Slab</option>
          <option value="retro">Retro</option>
          <option value="marker">Marker</option>
        </select>
      </div>
    </div>
  );
};
