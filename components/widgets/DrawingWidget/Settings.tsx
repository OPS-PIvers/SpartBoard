import React from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { WidgetData, DrawingConfig } from '../../../types';
import { Pencil, Palette, Minimize, Maximize } from 'lucide-react';
import { SettingsLabel } from '../../common/SettingsLabel';
import { DRAWING_DEFAULTS } from './constants';

export const DrawingSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as DrawingConfig;
  const width = config.width ?? DRAWING_DEFAULTS.WIDTH;
  const customColors = config.customColors ?? DRAWING_DEFAULTS.CUSTOM_COLORS;

  const handleColorChange = (index: number, newColor: string) => {
    const nextColors = [...customColors];
    nextColors[index] = newColor;
    updateWidget(widget.id, {
      config: {
        ...config,
        customColors: nextColors,
      } as DrawingConfig,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel icon={Palette}>Color Presets</SettingsLabel>
        <div className="flex gap-2 px-2">
          {customColors.map((c, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-lg border-2 border-white shadow-sm ring-1 ring-slate-200 relative overflow-hidden transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            >
              <input
                type="color"
                value={c}
                onChange={(e) => handleColorChange(i, e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Change preset color"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SettingsLabel icon={Pencil}>Brush Thickness</SettingsLabel>
        <div className="flex items-center gap-4 px-2">
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={width}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  width: parseInt(e.target.value, 10),
                } as DrawingConfig,
              })
            }
            className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="w-10 text-center font-mono  text-slate-700 text-sm">
            {width}px
          </span>
        </div>
      </div>

      <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
        <h4 className="text-xxs  text-indigo-700 uppercase mb-2">
          Modes Guide
        </h4>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-5 h-5 bg-white rounded-md flex items-center justify-center shadow-sm shrink-0">
              <Minimize className="w-3 h-3 text-indigo-600" />
            </div>
            <p className="text-xxs text-indigo-600 ">
              <b>Window:</b> Standard canvas inside the widget box. Best for
              quick sketches and notes.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="w-5 h-5 bg-indigo-600 rounded-md flex items-center justify-center shadow-sm shrink-0">
              <Maximize className="w-3 h-3 text-white" />
            </div>
            <p className="text-xxs text-indigo-600 ">
              <b>Overlay:</b> Hides the window and moves the toolbar to the top
              of your screen. Perfect for drawing over other content!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
