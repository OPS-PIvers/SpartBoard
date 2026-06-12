import React, { useState } from 'react';
import { NumberLineMode } from '@/types';

interface NumberLineToolProps {
  mode?: NumberLineMode;
  min?: number;
  max?: number;
  onModeChange?: (mode: NumberLineMode) => void;
  onRangeChange?: (min: number, max: number) => void;
}

function fractionLabel(num: number, denom: number): string {
  const whole = Math.floor(num / denom);
  const rem = num % denom;
  if (rem === 0) return `${whole === 0 ? '0' : whole}`;
  if (whole === 0) return `${rem}/${denom}`;
  return `${whole} ${rem}/${denom}`;
}

export const NumberLineTool: React.FC<NumberLineToolProps> = ({
  mode = 'integers',
  min = -10,
  max = 10,
  onModeChange,
  onRangeChange,
}) => {
  const [hoveredTick, setHoveredTick] = useState<number | null>(null);

  const svgH = 80;
  const padL = 32;
  const padR = 32;
  const axisY = 44;

  const MAX_RANGE = 200;
  const safeMax = Math.min(max, min + MAX_RANGE);
  const range = Math.max(1, safeMax - min);

  let tickCount: number;
  let subTicks: number;
  let denom = 1;
  if (mode === 'integers') {
    tickCount = range;
    subTicks = 0;
  } else if (mode === 'decimals') {
    tickCount = range;
    subTicks = 10;
  } else {
    denom = 4;
    tickCount = range * denom;
    subTicks = 0;
  }

  const totalSteps =
    mode === 'fractions' ? tickCount : tickCount * (subTicks || 1);
  const svgW = Math.max(400, totalSteps * 20 + padL + padR);

  const pxPerUnit = (svgW - padL - padR) / range;

  const ticks: React.ReactNode[] = [];

  if (mode === 'integers' || mode === 'decimals') {
    for (let i = 0; i <= range * (subTicks || 1); i++) {
      const val = min + i / (subTicks || 1);
      const x = padL + (val - min) * pxPerUnit;
      const isMajor = subTicks === 0 || i % (subTicks || 1) === 0;
      const tickH = isMajor ? 16 : 8;

      ticks.push(
        <g key={`tick-${i}`}>
          <line
            x1={x}
            y1={axisY - tickH}
            x2={x}
            y2={axisY + tickH}
            stroke={isMajor ? '#1e293b' : '#94a3b8'}
            strokeWidth={isMajor ? 1.5 : 0.8}
          />
          {isMajor && (
            <>
              {hoveredTick === i && (
                <circle cx={x} cy={axisY} r={10} fill="rgba(251,191,36,0.35)" />
              )}
              <text
                x={x}
                y={axisY + 28}
                textAnchor="middle"
                fontSize={mode === 'decimals' ? 9 : 11}
                fill="#1e293b"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {mode === 'decimals' ? val.toFixed(1) : Math.round(val)}
              </text>
            </>
          )}
          {isMajor && (
            <rect
              x={x - 12}
              y={axisY - tickH - 2}
              width={24}
              height={tickH * 2 + 40}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredTick(i)}
              onMouseLeave={() => setHoveredTick(null)}
            />
          )}
        </g>
      );
    }
  } else {
    for (let i = 0; i <= range * denom; i++) {
      const valNumer = min * denom + i;
      const x = padL + (i / denom) * pxPerUnit;
      const isWhole = i % denom === 0;
      const tickH = isWhole ? 16 : 9;

      ticks.push(
        <g key={`ftick-${i}`}>
          <line
            x1={x}
            y1={axisY - tickH}
            x2={x}
            y2={axisY + tickH}
            stroke={isWhole ? '#1e293b' : '#94a3b8'}
            strokeWidth={isWhole ? 1.5 : 0.9}
          />
          {isWhole && (
            <text
              x={x}
              y={axisY + 28}
              textAnchor="middle"
              fontSize={10}
              fill="#1e293b"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {valNumer / denom}
            </text>
          )}
          {!isWhole && (
            <text
              x={x}
              y={axisY - tickH - 4}
              textAnchor="middle"
              fontSize={8}
              fill="#64748b"
              fontFamily="monospace"
            >
              {fractionLabel(Math.abs(valNumer) % denom, denom)}
            </text>
          )}
        </g>
      );
    }
  }

  const modes: NumberLineMode[] = ['integers', 'decimals', 'fractions'];

  return (
    <div
      className="flex flex-col h-full w-full"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {/* Mode toggle and Range controls - Flex wrap and adaptive sizing */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 shrink-0">
        {onModeChange && (
          <div className="flex gap-1">
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`px-2 py-0.5 rounded-full font-black uppercase tracking-wider transition-colors border ${
                  mode === m
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                }`}
                style={{ fontSize: 'min(10px, 3.5cqmin)' }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
        {onRangeChange && (
          <div
            className="flex items-center gap-2 text-slate-500 font-bold"
            style={{ fontSize: 'min(11px, 3.8cqmin)' }}
          >
            <label className="flex items-center gap-1">
              Min:
              <input
                type="number"
                value={min}
                onChange={(e) => onRangeChange(Number(e.target.value), max)}
                className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-center"
                style={{ width: 'min(56px, 15cqw)' }}
              />
            </label>
            <label className="flex items-center gap-1">
              Max:
              <input
                type="number"
                value={max}
                onChange={(e) => onRangeChange(min, Number(e.target.value))}
                className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-center"
                style={{ width: 'min(56px, 15cqw)' }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Number line SVG */}
      <div className="flex-1 overflow-x-auto custom-scrollbar bg-slate-50/50 rounded-xl border border-slate-100">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: 'block', minWidth: svgW }}
          role="img"
          aria-label={`Number line from ${min} to ${safeMax}`}
        >
          <defs>
            <marker
              id="arrowL"
              markerWidth="8"
              markerHeight="8"
              refX="0"
              refY="4"
              orient="auto"
            >
              <path d="M8,0 L0,4 L8,8 Z" fill="#1e293b" />
            </marker>
            <marker
              id="arrowR"
              markerWidth="8"
              markerHeight="8"
              refX="8"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#1e293b" />
            </marker>
          </defs>
          <line
            x1={12}
            y1={axisY}
            x2={svgW - 12}
            y2={axisY}
            stroke="#1e293b"
            strokeWidth={2}
            markerStart="url(#arrowL)"
            markerEnd="url(#arrowR)"
          />
          {ticks}
        </svg>
      </div>
    </div>
  );
};
