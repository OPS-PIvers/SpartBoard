import React, { useState } from 'react';
import { WidgetData, MathToolsConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { CSS_PPI } from '@/components/widgets/math-tools/mathToolUtils';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

export const MathToolsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolsConfig;
  const [ppiInput, setPpiInput] = useState(
    String(config.dpiCalibration ?? CSS_PPI)
  );

  return (
    <div className="space-y-5 p-1">
      <div className="space-y-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
        <h3 className="text-xxs font-black text-purple-700 uppercase tracking-widest">
          Math Tools Palette
        </h3>
        <p className="text-xxs text-purple-600 leading-relaxed">
          <strong>Measurement</strong> tools (rulers, protractor) place a
          true-scale sticker on your board. <strong>Manipulatives</strong> spawn
          individual tile pieces. <strong>Interactive</strong> tools open
          full-featured windows.
        </p>
      </div>

      <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
          Palette DPI Calibration (px / inch)
        </label>
        <p className="text-xxs text-slate-400 leading-relaxed">
          Spawned true-scale tools inherit this PPI. CSS defines 1 in = 96 px —
          override only if your IFP screen renders differently.
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={60}
            max={300}
            value={ppiInput}
            onChange={(e) => setPpiInput(e.target.value)}
            className="w-20 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          />
          <button
            onClick={() => {
              const ppi = Math.max(60, Math.min(300, Number(ppiInput)));
              updateWidget(widget.id, {
                config: { ...config, dpiCalibration: ppi },
              });
            }}
            className="px-3 py-1.5 text-xxs font-black bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setPpiInput(String(CSS_PPI));
              updateWidget(widget.id, {
                config: { ...config, dpiCalibration: CSS_PPI },
              });
            }}
            className="px-2 py-1.5 text-xxs font-black bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
        <p className="text-xxs text-slate-400 leading-relaxed">
          <span className="font-black text-slate-600">Grade level filters</span>{' '}
          are configured per tool in Admin Settings → Feature Permissions → Math
          Tools.
        </p>
      </div>
    </div>
  );
};

export const MathToolsAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolsConfig;
  const updateConfig = (updates: Partial<MathToolsConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings config={config} updateConfig={updateConfig} />
    </div>
  );
};
