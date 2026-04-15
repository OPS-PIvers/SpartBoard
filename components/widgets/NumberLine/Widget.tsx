import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, NumberLineConfig, NumberLineMarker } from '@/types';
import { WidgetLayout } from '../WidgetLayout';
import { WIDGET_PALETTE } from '@/config/colors';
import { hexToRgba } from '@/utils/styles';

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

export const NumberLineWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as NumberLineConfig;
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(700);
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
  } = config;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSvgWidth(Math.max(400, entry.contentRect.width));
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const svgH = 200;
  const padL = 40;
  const padR = 40;
  const axisY = 120; // Move axis down a bit to leave room for jumps

  const safeMax = Math.max(min + 1, max); // Avoid division by zero
  const range = safeMax - min;
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

  const addMarker = (value: number) => {
    const newMarker: NumberLineMarker = {
      id: crypto.randomUUID(),
      value,
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
          className="h-full w-full flex flex-col relative rounded-xl overflow-hidden"
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

                let labelText = val.toString();
                if (displayMode === 'decimals') {
                  // Try to format nicely, avoiding 1.000000000001
                  labelText = Number(val.toFixed(4)).toString();
                } else if (displayMode === 'fractions') {
                  // Simple fraction conversion if step suggests a common denominator (e.g. 0.25 -> 4)
                  const denom = Math.round(1 / safeStep);
                  if (denom > 1 && denom <= 100 && (val * denom) % 1 === 0) {
                    labelText = fractionLabel(val * denom, denom);
                  } else {
                    labelText = Number(val.toFixed(4)).toString(); // Fallback
                  }
                }

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
                    <text
                      x={x}
                      y={axisY + 24}
                      textAnchor="middle"
                      fill="#1e293b"
                      fontFamily="monospace"
                      fontWeight="bold"
                      style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                    >
                      {labelText}
                    </text>

                    {/* Interaction Rect for adding markers quickly */}
                    <rect
                      x={x - 12}
                      y={axisY - 20}
                      width={24}
                      height={40}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredTick(i)}
                      onMouseLeave={() => setHoveredTick(null)}
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

                return (
                  <g key={marker.id}>
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
                    {marker.label && (
                      <text
                        x={x}
                        y={axisY - 52}
                        textAnchor="middle"
                        fill={marker.color}
                        fontWeight="bold"
                        style={{ fontSize: 'min(14px, 5cqmin)' }}
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

                return (
                  <g key={jump.id} style={{ color }}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      markerEnd="url(#jumpArrow)"
                    />
                    {jump.label && (
                      <text
                        x={midX}
                        y={controlY + jumpHeight * 0.5 - 5}
                        textAnchor="middle"
                        fill="currentColor"
                        fontWeight="bold"
                        stroke="white"
                        strokeWidth="4"
                        paintOrder="stroke"
                        style={{ fontSize: 'min(14px, 5cqmin)' }}
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
          <div className="absolute bottom-2 left-4 text-xs text-slate-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            Click axis to add markers. Use settings to add jumps.
          </div>
        </div>
      }
    />
  );
};
