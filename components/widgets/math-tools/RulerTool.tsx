import React from 'react';
import { CSS_PPI, cmToPx, inchesToPx } from './mathToolUtils';

interface RulerToolProps {
  units: 'in' | 'cm' | 'both';
  pixelsPerInch?: number;
  metric?: boolean;
  rotation?: number;
  // False lets a sticker ruler run past the window at full length, as before.
  contain?: boolean;
}

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
    const isMajor = sixteenth % 16 === 0;
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
      style={{
        display: 'block',
        userSelect: 'none',
        minWidth: rulerWidth + 2,
      }}
      role="img"
      aria-label="12-inch ruler"
    >
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
    const isMajor = mm % 10 === 0;
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
      style={{
        display: 'block',
        userSelect: 'none',
        minWidth: rulerWidth + 2,
      }}
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

const RULER_PX = 56;
const RULER_GAP_PX = 8;

// Caps the scroller width so the rotated ruler's bounding box stays inside the widget.
const rotatedMaxWidth = (rotation: number, heightPx: number): string => {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const caps = ['100%'];
  if (cos > 0.01)
    caps.push(`max(48px, calc((100cqw - ${heightPx * sin + 4}px) / ${cos}))`);
  if (sin > 0.01)
    caps.push(`max(48px, calc((100cqh - ${heightPx * cos + 4}px) / ${sin}))`);
  return `min(${caps.join(', ')})`;
};

export const RulerTool: React.FC<RulerToolProps> = ({
  units = 'both',
  pixelsPerInch = CSS_PPI,
  rotation = 0,
  contain = true,
}) => {
  const count = units === 'both' ? 2 : 1;
  const heightPx = count * RULER_PX + (count - 1) * RULER_GAP_PX + 8;
  return (
    <div
      className={
        contain
          ? 'min-w-0 overflow-auto custom-scrollbar no-scrollbar py-1'
          : 'py-1'
      }
      style={
        contain
          ? {
              maxWidth: rotatedMaxWidth(rotation, heightPx),
              maxHeight: '100%',
            }
          : undefined
      }
    >
      <div
        className="flex flex-col w-max"
        style={{ gap: `min(${RULER_GAP_PX}px, 2cqmin)` }}
      >
        {units !== 'cm' && <InchRuler pixelsPerInch={pixelsPerInch} />}
        {units !== 'in' && <MetricRuler pixelsPerInch={pixelsPerInch} />}
      </div>
    </div>
  );
};
