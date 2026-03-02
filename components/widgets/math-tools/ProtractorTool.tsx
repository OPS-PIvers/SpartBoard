import React, { useState, useCallback, useRef } from 'react';

interface ProtractorToolProps {
  pixelsPerInch?: number;
}

/**
 * 180° semicircular protractor SVG.
 * Renders at a fixed physical size (≈3in diameter when PPI=96).
 * User can drag the angle arm to measure angles interactively.
 */
export const ProtractorTool: React.FC<ProtractorToolProps> = ({
  pixelsPerInch = 96,
}) => {
  const radius = pixelsPerInch * 1.4; // ~1.4 inches radius
  const cx = radius;
  const cy = radius;
  const svgW = radius * 2;
  const svgH = radius + 20; // semicircle + base

  const [angleDeg, setAngleDeg] = useState<number>(90);
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.buttons !== 1) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - cx;
      const my = cy - (e.clientY - rect.top);
      let deg = Math.round((Math.atan2(my, mx) * 180) / Math.PI);
      if (deg < 0) deg += 360;
      if (deg >= 0 && deg <= 180) setAngleDeg(deg);
    },
    [cx, cy]
  );

  // Degree markings
  const ticks: React.ReactNode[] = [];
  for (let d = 0; d <= 180; d++) {
    const rad = ((180 - d) * Math.PI) / 180;
    const isMajor = d % 10 === 0;
    const isMid = d % 5 === 0 && !isMajor;
    const outerR = radius - 2;
    const innerR = isMajor
      ? radius - radius * 0.16
      : isMid
        ? radius - radius * 0.11
        : radius - radius * 0.07;

    const x1 = cx + outerR * Math.cos(rad);
    const y1 = cy - outerR * Math.sin(rad);
    const x2 = cx + innerR * Math.cos(rad);
    const y2 = cy - innerR * Math.sin(rad);

    ticks.push(
      <line
        key={`t${d}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#374151"
        strokeWidth={isMajor ? 1.4 : isMid ? 0.9 : 0.6}
      />
    );

    if (isMajor && d > 0 && d < 180) {
      const labelR = radius - radius * 0.26;
      const lx = cx + labelR * Math.cos(rad);
      const ly = cy - labelR * Math.sin(rad);
      ticks.push(
        <text
          key={`l${d}`}
          x={lx}
          y={ly}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.max(7, radius * 0.07)}
          fill="#1e293b"
          fontFamily="monospace"
          fontWeight="bold"
          transform={`rotate(${-(180 - d) + 90}, ${lx}, ${ly})`}
        >
          {d}
        </text>
      );
    }
  }

  // Angle arm
  const armRad = ((180 - angleDeg) * Math.PI) / 180;
  const armLen = radius - 4;
  const armX = cx + armLen * Math.cos(armRad);
  const armY = cy - armLen * Math.sin(armRad);

  // Arc path
  const arcStartX = cx + (radius - 2) * Math.cos(0);
  const arcStartY = cy - (radius - 2) * Math.sin(0);
  const arcEndX = cx + (radius - 2) * Math.cos(Math.PI);
  const arcEndY = cy - (radius - 2) * Math.sin(Math.PI);

  return (
    <div className="select-none" style={{ cursor: 'crosshair' }}>
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        role="img"
        aria-label={`Protractor showing ${angleDeg}°`}
      >
        {/* Semicircle body */}
        <path
          d={`M ${arcEndX} ${arcEndY} A ${radius - 2} ${radius - 2} 0 0 1 ${arcStartX} ${arcStartY} L ${cx} ${cy} Z`}
          fill="rgba(224, 242, 254, 0.85)"
          stroke="#0284c7"
          strokeWidth={1.5}
        />
        {/* Base line */}
        <line
          x1={0}
          y1={cy}
          x2={svgW}
          y2={cy}
          stroke="#0284c7"
          strokeWidth={1.8}
        />
        {/* Tick marks & labels */}
        {ticks}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={4} fill="#0284c7" />
        {/* Angle indicator arc */}
        {angleDeg > 0 && angleDeg < 180 && (
          <path
            d={`M ${cx + 24} ${cy} A 24 24 0 ${angleDeg > 90 ? 1 : 0} 1 ${cx + 24 * Math.cos(armRad)} ${cy - 24 * Math.sin(armRad)}`}
            fill="rgba(251,191,36,0.3)"
            stroke="#f59e0b"
            strokeWidth={1.5}
          />
        )}
        {/* Movable arm */}
        <line
          x1={cx}
          y1={cy}
          x2={armX}
          y2={armY}
          stroke="#dc2626"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Angle readout */}
        <rect
          x={cx - 26}
          y={cy - radius * 0.55}
          width={52}
          height={20}
          rx={5}
          fill="#1e293b"
          opacity={0.85}
        />
        <text
          x={cx}
          y={cy - radius * 0.55 + 14}
          textAnchor="middle"
          fontSize={Math.max(11, radius * 0.09)}
          fill="white"
          fontFamily="monospace"
          fontWeight="bold"
        >
          {angleDeg}°
        </text>
      </svg>
      <p
        className="text-center text-slate-400 mt-1"
        style={{ fontSize: Math.max(10, radius * 0.07) }}
      >
        Drag inside to measure angle
      </p>
    </div>
  );
};
