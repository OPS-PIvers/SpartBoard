import React from 'react';
import { CSS_PPI, cmToPx, inchesToPx } from './mathToolUtils';

interface RulerToolProps {
  units: 'in' | 'cm' | 'both';
  pixelsPerInch?: number;
  /** If true renders cm ruler, else inch */
  metric?: boolean;
}

/** Inch ruler SVG – physically accurate when pixelsPerInch matches screen DPI */
export const InchRuler: React.FC<{ pixelsPerInch?: number }> = ({
  pixelsPerInch = CSS_PPI,
}) => {
  const ppi = pixelsPerInch;
  const totalInches = 12;
  const rulerWidth = inchesToPx(totalInches, ppi);
  const rulerHeight = 56;
  const bodyTop = 8;
  const bodyH = rulerHeight - bodyTop;

  const ticks: React.ReactNode[] = [];

  for (let sixteenth = 0; sixteenth <= totalInches * 16; sixteenth++) {
    const x = (sixteenth / 16) * ppi;
    const isMajor = sixteenth % 16 === 0; // inch
    const isHalf = sixteenth % 8 === 0 && !isMajor;
    const isQuarter = sixteenth % 4 === 0 && !isMajor && !isHalf;
    const isEighth = sixteenth % 2 === 0 && !isQuarter && !isMajor && !isHalf;

    let tickH: number;
    let strokeW: number;
    if (isMajor) {
      tickH = bodyH - 2;
      strokeW = 1.2;
    } else if (isHalf) {
      tickH = Math.round(bodyH * 0.62);
      strokeW = 0.9;
    } else if (isQuarter) {
      tickH = Math.round(bodyH * 0.46);
      strokeW = 0.75;
    } else if (isEighth) {
      tickH = Math.round(bodyH * 0.32);
      strokeW = 0.6;
    } else {
      tickH = Math.round(bodyH * 0.22);
      strokeW = 0.5;
    }

    ticks.push(
      <line
        key={`t-${sixteenth}`}
        x1={x}
        y1={bodyTop}
        x2={x}
        y2={bodyTop + tickH}
        stroke="#374151"
        strokeWidth={strokeW}
      />
    );

    if (isMajor && sixteenth > 0 && sixteenth < totalInches * 16) {
      const inchNum = sixteenth / 16;
      ticks.push(
        <text
          key={`lbl-${sixteenth}`}
          x={x}
          y={bodyTop + bodyH - 2}
          textAnchor="middle"
          fontSize={Math.max(8, Math.round(ppi * 0.11))}
          fill="#1e293b"
          fontFamily="monospace"
          fontWeight="bold"
        >
          {inchNum}
        </text>
      );
    }
  }

  return (
    <svg
      width={rulerWidth + 2}
      height={rulerHeight}
      viewBox={`0 0 ${rulerWidth + 2} ${rulerHeight}`}
      style={{ display: 'block', userSelect: 'none' }}
      role="img"
      aria-label="12-inch ruler"
    >
      {/* Ruler body */}
      <rect
        x={0}
        y={bodyTop}
        width={rulerWidth}
        height={bodyH}
        rx={3}
        fill="#fef9c3"
        stroke="#ca8a04"
        strokeWidth={1.5}
      />
      {/* Edge highlight */}
      <rect
        x={1}
        y={bodyTop + 1}
        width={rulerWidth - 2}
        height={4}
        rx={2}
        fill="rgba(255,255,255,0.45)"
      />
      {/* Ticks and labels */}
      {ticks}
      {/* "in" label */}
      <text
        x={rulerWidth - 4}
        y={bodyTop + 10}
        textAnchor="end"
        fontSize={Math.max(7, Math.round(ppi * 0.09))}
        fill="#92400e"
        fontFamily="monospace"
        fontWeight="bold"
      >
        in
      </text>
    </svg>
  );
};

/** Metric (cm) ruler SVG */
export const MetricRuler: React.FC<{ pixelsPerInch?: number }> = ({
  pixelsPerInch = CSS_PPI,
}) => {
  const ppi = pixelsPerInch;
  const totalCm = 30;
  const rulerWidth = cmToPx(totalCm, ppi);
  const rulerHeight = 56;
  const bodyTop = 8;
  const bodyH = rulerHeight - bodyTop;

  const ticks: React.ReactNode[] = [];

  for (let mm = 0; mm <= totalCm * 10; mm++) {
    const x = (mm / 10) * cmToPx(1, ppi);
    const isMajor = mm % 10 === 0; // cm
    const isHalf = mm % 5 === 0 && !isMajor;

    let tickH: number;
    let strokeW: number;
    if (isMajor) {
      tickH = bodyH - 2;
      strokeW = 1.2;
    } else if (isHalf) {
      tickH = Math.round(bodyH * 0.55);
      strokeW = 0.8;
    } else {
      tickH = Math.round(bodyH * 0.3);
      strokeW = 0.55;
    }

    ticks.push(
      <line
        key={`t-${mm}`}
        x1={x}
        y1={bodyTop}
        x2={x}
        y2={bodyTop + tickH}
        stroke="#374151"
        strokeWidth={strokeW}
      />
    );

    if (isMajor && mm > 0 && mm < totalCm * 10) {
      const cmNum = mm / 10;
      ticks.push(
        <text
          key={`lbl-${mm}`}
          x={x}
          y={bodyTop + bodyH - 2}
          textAnchor="middle"
          fontSize={Math.max(7, Math.round(cmToPx(0.28, ppi)))}
          fill="#1e293b"
          fontFamily="monospace"
          fontWeight="bold"
        >
          {cmNum}
        </text>
      );
    }
  }

  return (
    <svg
      width={rulerWidth + 2}
      height={rulerHeight}
      viewBox={`0 0 ${rulerWidth + 2} ${rulerHeight}`}
      style={{ display: 'block', userSelect: 'none' }}
      role="img"
      aria-label="30 centimeter ruler"
    >
      <rect
        x={0}
        y={bodyTop}
        width={rulerWidth}
        height={bodyH}
        rx={3}
        fill="#dcfce7"
        stroke="#16a34a"
        strokeWidth={1.5}
      />
      <rect
        x={1}
        y={bodyTop + 1}
        width={rulerWidth - 2}
        height={4}
        rx={2}
        fill="rgba(255,255,255,0.45)"
      />
      {ticks}
      <text
        x={rulerWidth - 4}
        y={bodyTop + 10}
        textAnchor="end"
        fontSize={Math.max(7, Math.round(cmToPx(0.22, ppi)))}
        fill="#14532d"
        fontFamily="monospace"
        fontWeight="bold"
      >
        cm
      </text>
    </svg>
  );
};

export const RulerTool: React.FC<RulerToolProps> = ({
  units = 'both',
  pixelsPerInch = CSS_PPI,
}) => {
  if (units === 'in') {
    return <InchRuler pixelsPerInch={pixelsPerInch} />;
  }
  if (units === 'cm') {
    return <MetricRuler pixelsPerInch={pixelsPerInch} />;
  }
  // both: stack vertically
  return (
    <div className="flex flex-col gap-1">
      <InchRuler pixelsPerInch={pixelsPerInch} />
      <MetricRuler pixelsPerInch={pixelsPerInch} />
    </div>
  );
};
