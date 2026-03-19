import React, { Suspense, lazy, useRef } from 'react';
import { WidgetData, MathToolConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { CSS_PPI } from '../math-tools/mathToolUtils';
import { StickerPieceSVG } from '../math-tools/StickerPieces';
import { WidgetLayout } from '../WidgetLayout';
import { ROTATABLE_TOOLS } from './constants';
import { RotationHandle } from './RotationHandle';

// Lazy load all tool components to keep the bundle lean
const RulerTool = lazy(() =>
  import('../math-tools/RulerTool').then((m) => ({ default: m.RulerTool }))
);
const ProtractorTool = lazy(() =>
  import('../math-tools/ProtractorTool').then((m) => ({
    default: m.ProtractorTool,
  }))
);
const NumberLineTool = lazy(() =>
  import('../math-tools/NumberLineTool').then((m) => ({
    default: m.NumberLineTool,
  }))
);
const Base10BlocksTool = lazy(() =>
  import('../math-tools/Base10BlocksTool').then((m) => ({
    default: m.Base10BlocksTool,
  }))
);
const FractionTilesTool = lazy(() =>
  import('../math-tools/FractionTilesTool').then((m) => ({
    default: m.FractionTilesTool,
  }))
);
const GeoboardTool = lazy(() =>
  import('../math-tools/GeoboardTool').then((m) => ({
    default: m.GeoboardTool,
  }))
);
const PatternBlocksTool = lazy(() =>
  import('../math-tools/PatternBlocksTool').then((m) => ({
    default: m.PatternBlocksTool,
  }))
);
const AlgebraTilesTool = lazy(() =>
  import('../math-tools/AlgebraTilesTool').then((m) => ({
    default: m.AlgebraTilesTool,
  }))
);
const CoordinatePlaneTool = lazy(() =>
  import('../math-tools/CoordinatePlaneTool').then((m) => ({
    default: m.CoordinatePlaneTool,
  }))
);
const CalculatorTool = lazy(() =>
  import('../math-tools/CalculatorTool').then((m) => ({
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
        <div
          className="text-slate-400 p-4"
          style={{ fontSize: 'min(14px, 3.5cqmin)' }}
        >
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
  const containerRef = useRef<HTMLDivElement>(null);

  const handleUpdate = (updates: Partial<MathToolConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const isRotatable = ROTATABLE_TOOLS.includes(config.toolType);
  const rotation = config.rotation ?? 0;

  // ---- Sticker mode: bare SVG piece, no header chrome ----
  if (config.stickerMode && config.stickerPiece) {
    return (
      <div
        ref={containerRef}
        className="h-full w-full flex items-center justify-center p-1 group relative overflow-visible"
      >
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
          <RotationHandle
            rotation={rotation}
            onRotate={(r) => handleUpdate({ rotation: r })}
            containerRef={containerRef}
          />
        )}
      </div>
    );
  }

  // ---- Sticker mode: whole tool (ruler / protractor) without header badge ----
  if (config.stickerMode) {
    return (
      <div
        ref={containerRef}
        className="h-full w-full overflow-visible group relative"
      >
        <Suspense
          fallback={
            <div
              className="h-full flex items-center justify-center text-slate-400"
              style={{ fontSize: 'min(14px, 3.5cqmin)' }}
            >
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
            <RotationHandle
              rotation={rotation}
              onRotate={(r) => handleUpdate({ rotation: r })}
              containerRef={containerRef}
            />
          )}
        </Suspense>
      </div>
    );
  }

  // ---- Normal (interactive) mode: content fills widget, no redundant header ----
  return (
    <WidgetLayout
      contentClassName="flex flex-col flex-1 min-h-0 overflow-visible relative group"
      content={
        <Suspense
          fallback={
            <div
              className="flex-1 flex items-center justify-center text-slate-400"
              style={{ fontSize: 'min(14px, 3.5cqmin)' }}
            >
              Loading…
            </div>
          }
        >
          <div
            ref={containerRef}
            className="flex-1 flex items-center justify-center transition-transform duration-200 will-change-transform relative group"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <ToolContent config={config} onUpdate={handleUpdate} />
          </div>
          {isRotatable && (
            <RotationHandle
              rotation={rotation}
              onRotate={(r) => handleUpdate({ rotation: r })}
              containerRef={containerRef}
            />
          )}
        </Suspense>
      }
    />
  );
};
