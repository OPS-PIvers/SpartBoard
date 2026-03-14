import React, { Suspense, lazy, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import {
  WidgetData,
  MathToolConfig,
  NumberLineMode,
  MathToolType,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  CSS_PPI,
  getMathToolMeta,
  MATH_TOOL_META,
} from './math-tools/mathToolUtils';
import { StickerPieceSVG } from './math-tools/StickerPieces';
import { WidgetLayout } from './WidgetLayout';

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
  import('./math-tools/GeoboardTool').then((m) => ({
    default: m.GeoboardTool,
  }))
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

const ROTATABLE_TOOLS: MathToolType[] = [
  'ruler-in',
  'ruler-cm',
  'protractor',
  'pattern-blocks',
];

const RotationOverlay: React.FC<{
  rotation: number;
  onRotate: (newRotation: number) => void;
}> = ({ rotation, onRotate }) => {
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-dropdown pointer-events-none">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRotate((rotation + 15) % 360);
        }}
        className="p-1.5 bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 active:scale-95 transition-all pointer-events-auto"
        title="Rotate Clockwise (15°)"
      >
        <RotateCw size={14} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRotate((rotation - 15 + 360) % 360);
        }}
        className="p-1.5 bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 active:scale-95 transition-all pointer-events-auto"
        title="Rotate Counter-Clockwise (15°)"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
};

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
      return (
        <RulerTool units={config.rulerUnits ?? 'in'} pixelsPerInch={ppi} />
      );

    case 'ruler-cm':
      return (
        <RulerTool units={config.rulerUnits ?? 'cm'} pixelsPerInch={ppi} />
      );

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
            onUpdate({
              numberLineMin: Math.max(-1000, Math.min(1000, min)),
              numberLineMax: Math.max(-1000, Math.min(1000, max)),
            })
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

export const MathToolInstanceWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolConfig;

  const handleUpdate = (updates: Partial<MathToolConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const isRotatable = ROTATABLE_TOOLS.includes(config.toolType);
  const rotation = config.rotation ?? 0;

  // ---- Sticker mode: bare SVG piece, no header chrome ----
  if (config.stickerMode && config.stickerPiece) {
    return (
      <div className="h-full w-full flex items-center justify-center p-1 group relative overflow-visible">
        <div
          className="transition-transform duration-200 will-change-transform"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <StickerPieceSVG
            toolType={config.toolType}
            pieceId={config.stickerPiece}
          />
        </div>
        {isRotatable && (
          <RotationOverlay
            rotation={rotation}
            onRotate={(r) => handleUpdate({ rotation: r })}
          />
        )}
      </div>
    );
  }

  // ---- Sticker mode: whole tool (ruler / protractor) without header badge ----
  if (config.stickerMode) {
    return (
      <div className="h-full w-full overflow-visible group relative">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Loading…
            </div>
          }
        >
          <div
            className="h-full w-full flex items-center justify-center transition-transform duration-200 will-change-transform"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <ToolContent config={config} onUpdate={handleUpdate} />
          </div>
          {isRotatable && (
            <RotationOverlay
              rotation={rotation}
              onRotate={(r) => handleUpdate({ rotation: r })}
            />
          )}
        </Suspense>
      </div>
    );
  }

  // ---- Normal mode: header badge + tool content ----
  const meta = getMathToolMeta(config.toolType ?? 'ruler-in');

  const header = (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      <span className="leading-none" style={{ fontSize: 'min(24px, 10cqmin)' }}>
        {meta.emoji}
      </span>
      <span
        className="font-black text-slate-600 uppercase tracking-widest"
        style={{ fontSize: 'min(12px, 4.5cqmin)' }}
      >
        {meta.label}
      </span>
      <span
        className="ml-auto text-slate-300 font-mono"
        style={{ fontSize: 'min(10px, 3.5cqmin)' }}
      >
        {config.pixelsPerInch ?? CSS_PPI} px/in
      </span>
    </div>
  );

  return (
    <WidgetLayout
      header={header}
      contentClassName="flex flex-col flex-1 min-h-0 overflow-visible relative group"
      content={
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Loading…
            </div>
          }
        >
          <div
            className="flex-1 flex items-center justify-center transition-transform duration-200 will-change-transform"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <ToolContent config={config} onUpdate={handleUpdate} />
          </div>
          {isRotatable && (
            <RotationOverlay
              rotation={rotation}
              onRotate={(r) => handleUpdate({ rotation: r })}
            />
          )}
        </Suspense>
      }
    />
  );
};

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

      {/* Rotation control */}
      {isRotatable && (
        <div className="space-y-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
          <div className="flex justify-between items-center">
            <label className="text-xxs font-black text-indigo-400 uppercase tracking-widest block">
              Rotation ({config.rotation ?? 0}°)
            </label>
            <button
              onClick={() =>
                updateWidget(widget.id, { config: { ...config, rotation: 0 } })
              }
              className="text-xxs font-black text-indigo-600 hover:underline"
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
            className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
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
                className="px-1.5 py-0.5 text-[9px] font-bold bg-white border border-indigo-100 rounded text-indigo-600 hover:bg-indigo-50"
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
