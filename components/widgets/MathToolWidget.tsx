import React, { Suspense, lazy, useState } from 'react';
import {
  WidgetData,
  MathToolConfig,
  MathToolType,
  NumberLineMode,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { CSS_PPI, getMathToolMeta } from './math-tools/mathToolUtils';

// Lazy load all tool components to keep the bundle lean
const RulerTool = lazy(() =>
  import('./math-tools/RulerTool').then((m) => ({ default: m.RulerTool }))
);
const ProtractorTool = lazy(() =>
  import('./math-tools/ProtractorTool').then((m) => ({
    default: m.ProtractorTool,
  }))
);
const NumberLineTool = lazy(() =>
  import('./math-tools/NumberLineTool').then((m) => ({
    default: m.NumberLineTool,
  }))
);
const Base10BlocksTool = lazy(() =>
  import('./math-tools/Base10BlocksTool').then((m) => ({
    default: m.Base10BlocksTool,
  }))
);
const FractionTilesTool = lazy(() =>
  import('./math-tools/FractionTilesTool').then((m) => ({
    default: m.FractionTilesTool,
  }))
);
const GeoboardTool = lazy(() =>
  import('./math-tools/GeoboardTool').then((m) => ({ default: m.GeoboardTool }))
);
const PatternBlocksTool = lazy(() =>
  import('./math-tools/PatternBlocksTool').then((m) => ({
    default: m.PatternBlocksTool,
  }))
);
const AlgebraTilesTool = lazy(() =>
  import('./math-tools/AlgebraTilesTool').then((m) => ({
    default: m.AlgebraTilesTool,
  }))
);
const CoordinatePlaneTool = lazy(() =>
  import('./math-tools/CoordinatePlaneTool').then((m) => ({
    default: m.CoordinatePlaneTool,
  }))
);
const CalculatorTool = lazy(() =>
  import('./math-tools/CalculatorTool').then((m) => ({
    default: m.CalculatorTool,
  }))
);

function ToolContent({
  config,
  onUpdate,
}: {
  config: MathToolConfig;
  onUpdate: (updates: Partial<MathToolConfig>) => void;
}) {
  const ppi = config.pixelsPerInch ?? CSS_PPI;
  const toolType = config.toolType;

  switch (toolType) {
    case 'ruler-in':
      return <RulerTool units="in" pixelsPerInch={ppi} />;

    case 'ruler-cm':
      return <RulerTool units="cm" pixelsPerInch={ppi} />;

    case 'protractor':
      return <ProtractorTool pixelsPerInch={ppi} />;

    case 'number-line':
      return (
        <NumberLineTool
          mode={config.numberLineMode ?? 'integers'}
          min={config.numberLineMin ?? -10}
          max={config.numberLineMax ?? 10}
          onModeChange={(mode) => onUpdate({ numberLineMode: mode })}
          onRangeChange={(min, max) =>
            onUpdate({ numberLineMin: min, numberLineMax: max })
          }
        />
      );

    case 'base-10':
      return <Base10BlocksTool />;

    case 'fraction-tiles':
      return <FractionTilesTool />;

    case 'geoboard':
      return <GeoboardTool />;

    case 'pattern-blocks':
      return <PatternBlocksTool />;

    case 'algebra-tiles':
      return <AlgebraTilesTool />;

    case 'coordinate-plane':
      return <CoordinatePlaneTool />;

    case 'calculator':
      return <CalculatorTool />;

    default:
      return (
        <div className="text-slate-400 text-sm p-4">
          Unknown tool: {toolType}
        </div>
      );
  }
}

export const MathToolWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolConfig;
  const meta = getMathToolMeta(config.toolType ?? 'ruler-in');

  const handleUpdate = (updates: Partial<MathToolConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  return (
    <div className="h-full w-full flex flex-col overflow-auto p-2 gap-2">
      {/* Tool header badge */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-lg leading-none">{meta.emoji}</span>
        <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
          {meta.label}
        </span>
        <span className="ml-auto text-xxs text-slate-300 font-mono">
          {config.pixelsPerInch ?? CSS_PPI} px/in
        </span>
      </div>
      {/* Tool content */}
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Loading…
          </div>
        }
      >
        <ToolContent config={config} onUpdate={handleUpdate} />
      </Suspense>
    </div>
  );
};

export const MathToolSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolConfig;
  const [ppiInput, setPpiInput] = useState(
    String(config.pixelsPerInch ?? CSS_PPI)
  );

  const TOOL_TYPES: { type: MathToolType; label: string; emoji: string }[] = [
    { type: 'ruler-in', label: 'Inch Ruler', emoji: '📏' },
    { type: 'ruler-cm', label: 'Metric Ruler (cm)', emoji: '📏' },
    { type: 'protractor', label: 'Protractor', emoji: '📐' },
    { type: 'number-line', label: 'Number Line', emoji: '〰️' },
    { type: 'base-10', label: 'Base-10 Blocks', emoji: '🟦' },
    { type: 'fraction-tiles', label: 'Fraction Tiles', emoji: '🟩' },
    { type: 'geoboard', label: 'Geoboard', emoji: '🔵' },
    { type: 'pattern-blocks', label: 'Pattern Blocks', emoji: '🔷' },
    { type: 'algebra-tiles', label: 'Algebra Tiles', emoji: '🟪' },
    { type: 'coordinate-plane', label: 'Coordinate Plane', emoji: '📊' },
    { type: 'calculator', label: 'Calculator', emoji: '🔢' },
  ];

  const numberLineModes: NumberLineMode[] = [
    'integers',
    'decimals',
    'fractions',
  ];

  return (
    <div className="space-y-5 p-1">
      {/* Tool type selector */}
      <div className="space-y-2">
        <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
          Tool Type
        </label>
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
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{emoji}</span>
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Number line settings */}
      {config.toolType === 'number-line' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
              Mode
            </label>
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
                      ? 'bg-indigo-600 text-white border-indigo-600'
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
              <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block mb-1">
                Min
              </label>
              <input
                type="number"
                value={config.numberLineMin ?? -10}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      numberLineMin: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block mb-1">
                Max
              </label>
              <input
                type="number"
                value={config.numberLineMax ?? 10}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      numberLineMax: Number(e.target.value),
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
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
            Units Displayed
          </label>
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
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
            True-Scale Calibration (px / inch)
          </label>
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
            className="px-3 py-1.5 text-xxs font-black bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
