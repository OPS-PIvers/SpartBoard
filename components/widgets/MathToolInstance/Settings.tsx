import React, { useState } from 'react';
import { WidgetData, MathToolConfig, NumberLineMode } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  CSS_PPI,
  MATH_TOOL_META,
} from '@/components/widgets/math-tools/mathToolUtils';
import { ROTATABLE_TOOLS } from './constants';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const MathToolInstanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolConfig;
  const [ppiInput, setPpiInput] = useState(
    String(config.pixelsPerInch ?? CSS_PPI)
  );

  // Derived from the canonical MATH_TOOL_META — no local duplication
  const TOOL_TYPES = MATH_TOOL_META;
  const isRotatable = ROTATABLE_TOOLS.includes(config.toolType);

  const numberLineModes: NumberLineMode[] = [
    'integers',
    'decimals',
    'fractions',
  ];

  return (
    <div className="space-y-5 p-1">
      {/* Tool type selector */}
      <div className="space-y-2">
        <SettingsLabel>Tool Type</SettingsLabel>
        <div className="grid grid-cols-2 gap-1">
          {TOOL_TYPES.map(({ type, label, emoji }) => (
            <button
              key={type}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, toolType: type },
                })
              }
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xxs font-bold border transition-all text-left ${
                config.toolType === type
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{emoji}</span>
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rotation control */}
      {isRotatable && (
        <div className="space-y-2 p-3 bg-brand-blue-lighter/50 rounded-xl border border-brand-blue-lighter">
          <div className="flex justify-between items-center">
            <label className="text-xxs font-black text-brand-blue-light uppercase tracking-widest block">
              Rotation ({config.rotation ?? 0}°)
            </label>
            <button
              onClick={() =>
                updateWidget(widget.id, { config: { ...config, rotation: 0 } })
              }
              className="text-xxs font-black text-brand-blue-primary hover:underline"
            >
              Reset
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={config.rotation ?? 0}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: { ...config, rotation: Number(e.target.value) },
              })
            }
            className="w-full h-1.5 bg-brand-blue-lighter rounded-lg appearance-none cursor-pointer accent-brand-blue-primary"
          />
          <div className="flex gap-1 justify-center mt-1">
            {[0, 45, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, rotation: deg },
                  })
                }
                className="px-1.5 py-0.5 text-xxxs font-bold bg-white border border-brand-blue-lighter rounded text-brand-blue-primary hover:bg-brand-blue-lighter"
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Number line settings */}
      {config.toolType === 'number-line' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <SettingsLabel>Mode</SettingsLabel>
            <div className="flex gap-1">
              {numberLineModes.map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: { ...config, numberLineMode: m },
                    })
                  }
                  className={`px-2 py-1 rounded-lg text-xxs font-black border transition-all ${
                    (config.numberLineMode ?? 'integers') === m
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <SettingsLabel>Min</SettingsLabel>
              <input
                type="number"
                value={config.numberLineMin ?? -10}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      numberLineMin: Math.max(
                        -1000,
                        Math.min(1000, Number(e.target.value))
                      ),
                    },
                  })
                }
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <SettingsLabel>Max</SettingsLabel>
              <input
                type="number"
                value={config.numberLineMax ?? 10}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      numberLineMax: Math.max(
                        -1000,
                        Math.min(1000, Number(e.target.value))
                      ),
                    },
                  })
                }
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Ruler units (for ruler types) */}
      {(config.toolType === 'ruler-in' || config.toolType === 'ruler-cm') && (
        <div className="space-y-1">
          <SettingsLabel>Units Displayed</SettingsLabel>
          <div className="flex gap-1">
            {(['in', 'cm', 'both'] as const).map((u) => (
              <button
                key={u}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, rulerUnits: u },
                  })
                }
                className={`px-2 py-1 rounded-lg text-xxs font-black border transition-all ${
                  (config.rulerUnits ?? 'both') === u
                    ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DPI Calibration */}
      <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div className="space-y-1">
          <SettingsLabel>True-Scale Calibration (px / inch)</SettingsLabel>
          <p className="text-xxs text-slate-400 leading-relaxed">
            CSS defines 1 in = 96 px. Adjust this if your IFP renders at a
            different physical DPI. Measure a known object on screen to
            calibrate.
          </p>
        </div>
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
                config: { ...config, pixelsPerInch: ppi },
              });
            }}
            className="px-3 py-1.5 text-xxs font-black bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setPpiInput(String(CSS_PPI));
              updateWidget(widget.id, {
                config: { ...config, pixelsPerInch: CSS_PPI },
              });
            }}
            className="px-3 py-1.5 text-xxs font-black bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};
