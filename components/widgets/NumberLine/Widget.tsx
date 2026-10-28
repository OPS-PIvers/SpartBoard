import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { WidgetData, NumberLineConfig, NumberLineMarker } from '@/types';
import { WidgetLayout } from '../WidgetLayout';
import { WIDGET_PALETTE } from '@/config/colors';
import { hexToRgba } from '@/utils/styles';
import { tourFieldAttr } from '@/config/tourAnchors';

// Map the typography preset id ('sans', 'handwritten', etc.) to the
// Tailwind utility class so the SVG <text> element picks up the same
// family the dashboard's CSS pipeline already defines. Hoisted out of
// the component body so it isn't re-allocated on every render.
const FONT_CLASS_MAP: Record<string, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
  handwritten: 'font-handwritten',
  rounded: 'font-rounded',
  fun: 'font-fun',
  comic: 'font-comic',
  slab: 'font-slab',
  retro: 'font-retro',
  marker: 'font-marker',
  cursive: 'font-cursive',
};

function fractionLabel(num: number, denom: number): string {
  const sign = num < 0 ? -1 : 1;
  const absNum = Math.abs(num);
  const whole = Math.floor(absNum / denom);
  const rem = absNum % denom;

  if (rem === 0) {
    const value = whole === 0 ? '0' : `${whole}`;
    return sign < 0 && value !== '0' ? `-${value}` : value;
  }
  if (whole === 0) {
    const frac = `${rem}/${denom}`;
    return sign < 0 ? `-${frac}` : frac;
  }
  const mixed = `${whole} ${rem}/${denom}`;
  return sign < 0 ? `-${mixed}` : mixed;
}

// Rough bold-text width in SVG units, used to keep labels inside the line and apart.
const CHAR_EM = 0.62;
const textWidth = (text: string, fontPx: number): number =>
  text.length * CHAR_EM * fontPx;

const LABEL_PX = 14;
const TICK_LABEL_PX = 12;

// Smallest 1, 2 or 5 times a power of ten that is at least n, so thinned labels count in round steps.
const niceUp = (n: number): number => {
  if (!(n > 1)) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  const m = [1, 2, 5, 10].find((f) => f * pow >= n - 1e-9) ?? 10;
  return m * pow;
};

/** Font size and x for a label so it fits between the line's edges. */
const fitLabel = (
  text: string,
  x: number,
  left: number,
  right: number
): { x: number; fontSize: number } => {
  const fontSize = Math.min(
    LABEL_PX,
    (right - left) / Math.max(1, text.length * CHAR_EM)
  );
  const half = textWidth(text, fontSize) / 2;
  return {
    fontSize,
    x: Math.min(Math.max(x, left + half), right - half),
  };
};

const PAD_X = 40;

/** Marker label rows (labels that would overlap move up a row, capped at 4); crowded when a label had no free row. */
const layoutMarkerRows = (
  markers: NumberLineMarker[],
  min: number,
  pxPerUnit: number,
  svgWidth: number
): { rows: Map<string, number>; crowded: boolean } => {
  const rows = new Map<string, number>();
  const rowEnds: number[] = [];
  let crowded = false;
  const placed = markers
    .filter((m) => m.label)
    .map((m) => ({ m, x: PAD_X + (m.value - min) * pxPerUnit }))
    .filter(({ x }) => x >= PAD_X && x <= svgWidth - PAD_X)
    .sort((a, b) => a.x - b.x);
  for (const { m, x } of placed) {
    const label = m.label ?? '';
    const { x: lx, fontSize } = fitLabel(label, x, 4, svgWidth - 4);
    const half = textWidth(label, fontSize) / 2;
    let row = rowEnds.findIndex((end) => end + 6 <= lx - half);
    if (row === -1) {
      if (rowEnds.length >= 4) crowded = true;
      row = Math.min(rowEnds.length, 3);
    }
    rowEnds[row] = lx + half;
    rows.set(m.id, row);
  }
  return { rows, crowded };
};

export const NumberLineWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboardActions();
  const config = widget.config as NumberLineConfig;
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 700, tall: false });
  const [hoveredTick, setHoveredTick] = useState<number | null>(null);

  const {
    min,
    max,
    step,
    displayMode,
    markers = [],
    jumps = [],
    showArrows,
    cardColor = '#ffffff',
    cardOpacity = 1,
    fontFamily,
    fontColor = '#1e293b',
  } = config;

  // Resolve the typography preset id to a Tailwind class. When
  // fontFamily is undefined the panel's "Inherit (Dashboard default)"
  // is selected — leave the class empty so the SVG <text> inherits
  // the parent container's family rather than silently overriding to
  // monospace (which would make "Inherit" and "Monospace" identical).
  const fontClass =
    typeof fontFamily === 'string' && FONT_CLASS_MAP[fontFamily]
      ? FONT_CLASS_MAP[fontFamily]
      : '';

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(400, entry.contentRect.width);
        const tall = entry.contentRect.height >= 500;
        setBox((prev) =>
          prev.w === w && prev.tall === tall ? prev : { w, tall }
        );
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const svgH = 200;
  const padL = PAD_X;
  const padR = PAD_X;
  const axisY = 120; // Move axis down a bit to leave room for jumps

  const safeMax = Math.max(min + 1, max); // Avoid division by zero
  const range = safeMax - min;
  // Large cards (maximized) draw the line at up to 1.7x, stepping down while marker labels would overlap.
  const zoom = useMemo(() => {
    let z = box.tall ? Math.min(1.7, Math.max(1, box.w / 900)) : 1;
    while (z > 1) {
      const w = box.w / z;
      if (!layoutMarkerRows(markers, min, (w - 2 * PAD_X) / range, w).crowded)
        break;
      z = Math.max(1, z - 0.1);
    }
    return z;
  }, [box, markers, min, range]);
  const svgWidth = box.w / zoom;
  const pxPerUnit = (svgWidth - padL - padR) / range;

  // Maximum number of ticks to avoid performance issues
  const MAX_TICKS = 5000;
  // Ensure step is positive to avoid infinite loops
  const safeStep = Math.max(0.01, step);
  const tickValues = useMemo(() => {
    const ticks: number[] = [];
    // we calculate the number of steps, then derive each tick from `min`
    const rawNumSteps = Math.floor(range / safeStep);

    // If the range is smaller than the step, just show endpoints
    if (rawNumSteps <= 0) {
      ticks.push(min, safeMax);
      return ticks;
    }

    // Cap the number of steps to ensure we don't generate too many ticks
    const maxSteps = MAX_TICKS - 1; // ticks = steps + 1

    let effectiveStep = safeStep;
    let numSteps = rawNumSteps;
    if (rawNumSteps > maxSteps) {
      const stride = Math.ceil(rawNumSteps / maxSteps);
      effectiveStep = safeStep * stride;
      numSteps = Math.floor(range / effectiveStep);
    }

    for (let i = 0; i <= numSteps; i++) {
      ticks.push(min + i * effectiveStep);
    }

    const epsilon = 0.0001;
    // Ensure the minimum endpoint is always included as a tick
    if (ticks.length === 0 || Math.abs(ticks[0] - min) > epsilon) {
      ticks.unshift(min);
    }

    // Ensure the maximum endpoint is always included as a tick
    const lastTick = ticks[ticks.length - 1];
    if (Math.abs(lastTick - safeMax) > epsilon) {
      ticks.push(safeMax);
    }
    return ticks;
  }, [min, safeMax, safeStep, range, MAX_TICKS]);

  const tickLabel = (val: number): string => {
    // toFixed(4) strips floating-point noise (0 + 3×0.1) from every display mode's label.
    const plain = Number(val.toFixed(4)).toString();
    if (displayMode !== 'fractions') return plain;
    // A step like 0.25 implies a denominator of 4; round so FP noise doesn't hide a clean fraction.
    const denom = Math.round(1 / safeStep);
    const rawNumerator = val * denom;
    const roundedNumerator = Math.round(rawNumerator);
    const isFractional =
      denom > 1 &&
      denom <= 100 &&
      Math.abs(rawNumerator - roundedNumerator) < 1e-9;
    return isFractional ? fractionLabel(roundedNumerator, denom) : plain;
  };

  // Show every nth tick when they'd crowd: labels need room to stay apart, tick lines need a few px.
  const tickPx =
    tickValues.length > 1
      ? (svgWidth - padL - padR) / (tickValues.length - 1)
      : svgWidth;
  const widestTickLabel = tickValues.reduce(
    (w, v) => Math.max(w, textWidth(tickLabel(v), TICK_LABEL_PX)),
    0
  );
  const tickStride = niceUp(4 / tickPx);
  // A multiple of the tick stride, so every label sits on a drawn tick.
  const labelStride =
    tickStride * niceUp((widestTickLabel + 8) / (tickPx * tickStride));
  const lastTick = tickValues.length - 1;
  const lastX = padL + ((tickValues[lastTick] ?? min) - min) * pxPerUnit;

  // Marker labels that would overlap a neighbour move up a row.
  const markerRows = useMemo(
    () => layoutMarkerRows(markers, min, pxPerUnit, svgWidth).rows,
    [markers, min, pxPerUnit, svgWidth]
  );

  const addMarker = (value: number) => {
    // Strip floating-point noise accumulated by the index-based tick formula
    // (e.g. 0 + 3×0.1 = 0.30000000000000004). Without rounding, the raw dirty
    // value is persisted to Firestore and displayed verbatim in the settings
    // panel, so teachers see "0.30000000000000004" instead of "0.3".
    // toFixed(10) is well above any precision needed (step ≥ 0.01 → 2 d.p.),
    // so it removes only the noise without truncating real digits.
    const cleanValue = parseFloat(value.toFixed(10));
    const newMarker: NumberLineMarker = {
      id: crypto.randomUUID(),
      value: cleanValue,
      color: WIDGET_PALETTE[markers.length % WIDGET_PALETTE.length],
    };
    updateWidget(widget.id, {
      config: { ...config, markers: [...markers, newMarker] },
    });
  };

  return (
    <WidgetLayout
      contentClassName="flex flex-col flex-1 min-h-0 overflow-visible relative group"
      content={
        <div
          ref={containerRef}
          className="h-full w-full flex flex-col relative rounded-[var(--window-radius,0px)] overflow-hidden"
          style={{ backgroundColor: hexToRgba(cardColor, cardOpacity) }}
        >
          <div className="flex-1 overflow-visible">
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${svgWidth} ${svgH}`}
              style={{ display: 'block' }}
              role="img"
              aria-label={`Number line from ${min} to ${safeMax}`}
            >
              <defs>
                <marker
                  id="arrowL"
                  markerWidth="10"
                  markerHeight="10"
                  refX="0"
                  refY="5"
                  orient="auto"
                >
                  <path d="M10,0 L0,5 L10,10 Z" fill="#1e293b" />
                </marker>
                <marker
                  id="arrowR"
                  markerWidth="10"
                  markerHeight="10"
                  refX="10"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 Z" fill="#1e293b" />
                </marker>
                <marker
                  id="jumpArrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="8"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                </marker>
              </defs>

              {/* Main Axis Line */}
              <line
                x1={showArrows ? 15 : padL}
                y1={axisY}
                x2={showArrows ? svgWidth - 15 : svgWidth - padR}
                y2={axisY}
                stroke="#1e293b"
                strokeWidth={2}
                markerStart={showArrows ? 'url(#arrowL)' : undefined}
                markerEnd={showArrows ? 'url(#arrowR)' : undefined}
              />

              {/* Ticks */}
              {tickValues.map((val, i) => {
                const x = padL + (val - min) * pxPerUnit;
                const isHovered = hoveredTick === i;

                // The end tick always shows; a stride tick or label too close to it gives way.
                const gapToEnd = lastX - x;
                const showsTick =
                  i === lastTick || (i % tickStride === 0 && gapToEnd >= 4);
                if (!showsTick) return null;
                const showsLabel =
                  i === lastTick ||
                  (i % labelStride === 0 && gapToEnd >= widestTickLabel + 8);
                const hitWidth = Math.min(24, tickPx * tickStride);

                return (
                  <g key={`tick-${i}`}>
                    <line
                      x1={x}
                      y1={axisY - 8}
                      x2={x}
                      y2={axisY + 8}
                      stroke="#1e293b"
                      strokeWidth={1.5}
                    />
                    {showsLabel && (
                      <text
                        x={x}
                        y={axisY + 24}
                        textAnchor="middle"
                        fill={fontColor}
                        className={fontClass}
                        fontWeight="bold"
                        style={{ fontSize: TICK_LABEL_PX }}
                      >
                        {tickLabel(val)}
                      </text>
                    )}

                    {/* Interaction Rect for adding markers quickly */}
                    <rect
                      x={x - hitWidth / 2}
                      y={axisY - 20}
                      width={hitWidth}
                      height={40}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredTick(i)}
                      onMouseLeave={() => setHoveredTick(null)}
                      {...tourFieldAttr(
                        'number-line.add-marker',
                        widget.type,
                        String(val)
                      )}
                      onClick={() => addMarker(val)}
                    />
                    {isHovered && (
                      <circle
                        cx={x}
                        cy={axisY}
                        r={12}
                        fill="rgba(59, 130, 246, 0.2)"
                        className="pointer-events-none"
                      />
                    )}
                  </g>
                );
              })}

              {/* Markers */}
              {markers.map((marker) => {
                const x = padL + (marker.value - min) * pxPerUnit;
                if (x < padL || x > svgWidth - padR) return null; // Out of bounds visually

                const row = markerRows.get(marker.id) ?? 0;
                const fit = marker.label
                  ? fitLabel(marker.label, x, 4, svgWidth - 4)
                  : null;

                return (
                  <g key={marker.id} className="pointer-events-none">
                    <line
                      x1={x}
                      y1={axisY}
                      x2={x}
                      y2={axisY - 40}
                      stroke={marker.color}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                    <circle cx={x} cy={axisY - 40} r={6} fill={marker.color} />
                    {marker.label && fit && (
                      <text
                        x={fit.x}
                        y={Math.max(axisY - 52 - row * 18, LABEL_PX + 4)}
                        textAnchor="middle"
                        fill={marker.color}
                        fontWeight="bold"
                        style={{ fontSize: fit.fontSize }}
                      >
                        {marker.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Jumps */}
              {jumps.map((jump, idx) => {
                const startX = padL + (jump.startValue - min) * pxPerUnit;
                const endX = padL + (jump.endValue - min) * pxPerUnit;

                // Avoid rendering if completely out of bounds (simplification)
                if (
                  Math.min(startX, endX) > svgWidth - padR ||
                  Math.max(startX, endX) < padL
                )
                  return null;

                const isForward = jump.endValue >= jump.startValue;
                const color = isForward ? '#10b981' : '#f43f5e'; // Green for forward, Red for backward

                // Stagger jump heights if they overlap or just based on index to prevent stacking
                const jumpHeight = 40 + (idx % 3) * 15;
                const midX = (startX + endX) / 2;
                const controlY = axisY - jumpHeight * 2;

                // Determine direction for arrow
                const pathData = `M ${startX} ${axisY} Q ${midX} ${controlY} ${endX} ${axisY}`;

                const jumpFit = jump.label
                  ? fitLabel(jump.label, midX, 4, svgWidth - 4)
                  : null;

                return (
                  <g
                    key={jump.id}
                    className="pointer-events-none"
                    style={{ color }}
                  >
                    <path
                      d={pathData}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      markerEnd="url(#jumpArrow)"
                    />
                    {jump.label && jumpFit && (
                      <text
                        x={jumpFit.x}
                        y={Math.max(
                          controlY + jumpHeight * 0.5 - 5,
                          jumpFit.fontSize + 6
                        )}
                        textAnchor="middle"
                        fill="currentColor"
                        fontWeight="bold"
                        stroke="white"
                        strokeWidth="4"
                        paintOrder="stroke"
                        style={{ fontSize: jumpFit.fontSize }}
                      >
                        {jump.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Helpful tooltip/legend */}
          <div
            className="absolute text-slate-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              bottom: 'min(8px, 4cqmin)',
              left: 'min(16px, 8cqmin)',
              fontSize: 'min(12px, 6cqmin)',
            }}
          >
            Click the line to add a marker.
          </div>
        </div>
      }
    />
  );
};
