import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, NumberLineConfig, NumberLineMarker } from '@/types';
import { WidgetLayout } from '../WidgetLayout';

function fractionLabel(num: number, denom: number): string {
  const whole = Math.floor(num / denom);
  const rem = num % denom;
  if (rem === 0) return `${whole === 0 ? '0' : whole}`;
  if (whole === 0) return `${rem}/${denom}`;
  return `${whole} ${rem}/${denom}`;
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

  // Ensure step is positive to avoid infinite loops
  const safeStep = Math.max(0.01, step);
  const tickValues = useMemo(() => {
    const ticks = [];
    // To handle floating point inaccuracies in JS when doing `i += step`
    // We calculate the number of steps
    const numSteps = Math.floor(range / safeStep);
    for (let i = 0; i <= numSteps; i++) {
      ticks.push(min + i * safeStep);
    }
    // ensure max is included if it perfectly aligns (or close enough)
    const lastTick = ticks[ticks.length - 1];
    if (
      Math.abs(lastTick - safeMax) > 0.0001 &&
      Math.abs(lastTick + safeStep - safeMax) < 0.0001
    ) {
      ticks.push(safeMax);
    }
    return ticks;
  }, [min, safeMax, safeStep, range]);

  const addMarker = (value: number) => {
    const newMarker: NumberLineMarker = {
      id: crypto.randomUUID(),
      value,
      color: '#ef4444', // Red default
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
          className="h-full w-full flex flex-col relative bg-white rounded-xl overflow-hidden"
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
                      fontSize={12}
                      fill="#1e293b"
                      fontFamily="monospace"
                      fontWeight="bold"
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
                        fontSize={14}
                        fill={marker.color}
                        fontWeight="bold"
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
                        fontSize={14}
                        fill="currentColor"
                        fontWeight="bold"
                        className="bg-white"
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
