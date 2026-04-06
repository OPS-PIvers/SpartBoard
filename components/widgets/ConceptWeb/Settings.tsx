import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetComponentProps, ConceptWebConfig } from '@/types';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

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

  const defaultWidth = config.defaultNodeWidth ?? 15;
  const defaultHeight = config.defaultNodeHeight ?? 15;

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWidget(widget.id, {
      config: { ...config, defaultNodeWidth: parseInt(e.target.value, 10) },
    });
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWidget(widget.id, {
      config: { ...config, defaultNodeHeight: parseInt(e.target.value, 10) },
    });
  };

  return (
    <div className="space-y-4 p-4 text-slate-800">
      <div className="space-y-2">
        <label
          htmlFor="defaultNodeWidth"
          className="block text-sm font-medium mb-1"
        >
          Default Node Width ({defaultWidth}%)
        </label>
        <input
          id="defaultNodeWidth"
          type="range"
          min={5}
          max={50}
          value={defaultWidth}
          onChange={handleWidthChange}
          className="w-full"
        />

        <label
          htmlFor="defaultNodeHeight"
          className="block text-sm font-medium mb-1"
        >
          Default Node Height ({defaultHeight}%)
        </label>
        <input
          id="defaultNodeHeight"
          type="range"
          min={5}
          max={50}
          value={defaultHeight}
          onChange={handleHeightChange}
          className="w-full"
        />

        <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-center justify-center min-h-[150px] relative overflow-hidden">
          {/* We simulate the visual result using container queries within the preview bounds to ensure the relative font sizes scale identically to the widget's render behavior. */}
          <div
            className="absolute shadow-sm border border-slate-300 flex flex-col items-center justify-center p-2 rounded-lg"
            style={{
              width: `${defaultWidth}%`,
              height: `${defaultHeight}%`,
              backgroundColor: '#fdf0d5',
              containerType: 'size',
            }}
          >
            <textarea
              className="w-full h-full text-center bg-transparent border-none resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 rounded-sm font-medium text-slate-800 leading-tight"
              style={{ fontSize: '15cqmin' }}
              value="Idea..."
              readOnly
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          These dimensions apply to new nodes. You can still resize nodes
          individually!
        </p>
      </div>

      <div className="border-t border-slate-200 pt-4">
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
  const updateConfig = (updates: Partial<ConceptWebConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings config={config} updateConfig={updateConfig} />
    </div>
  );
};
