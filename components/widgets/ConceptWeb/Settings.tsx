import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetComponentProps,
  ConceptWebConfig,
  GlobalFontFamily,
} from '@/types';

export const ConceptWebSettings: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ConceptWebConfig;

  const handleClear = () => {
    updateWidget(widget.id, {
      config: { ...config, nodes: [], edges: [] },
    });
  };

  return (
    <div className="space-y-4 p-4 text-slate-800">
      <div>
        <button
          onClick={handleClear}
          className="w-full py-2 px-4 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 transition-colors font-medium"
        >
          Clear All Nodes & Edges
        </button>
      </div>
    </div>
  );
};

export const ConceptWebAppearanceSettings: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ConceptWebConfig;

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    const fontFamily =
      selected === 'global' ? undefined : (selected as GlobalFontFamily);

    updateWidget(widget.id, {
      config: { ...config, fontFamily },
    });
  };

  return (
    <div className="space-y-4 p-4 text-slate-800">
      <div>
        <label className="block text-sm font-medium mb-1">Font Family</label>
        <select
          value={config.fontFamily ?? 'global'}
          onChange={handleFontChange}
          className="w-full rounded border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="global">Global (Dashboard default)</option>
          <option value="sans">Sans Serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
          <option value="comic">Comic</option>
          <option value="handwritten">Handwritten</option>
        </select>
      </div>
    </div>
  );
};
