import React from 'react';

export interface DistributionStripRow {
  id: string;
  label: React.ReactNode;
  /** Every classmate's percent, no names. */
  values: number[];
  /** This student's percent, or null. */
  mark: number | null;
  /** Right-hand text, e.g. the score or "Excused". */
  text: React.ReactNode;
  title?: string;
}

const W = 300;
const PAD = 4;
const x = (v: number) =>
  PAD + (Math.max(0, Math.min(100, v)) / 100) * (W - PAD * 2);

/** Comparison card: classmates as grey dots, the student as the blue dot. */
export const DistributionStrip: React.FC<{
  rows: DistributionStripRow[];
  wrapMark?: (node: React.ReactElement) => React.ReactNode;
  empty?: string;
}> = ({ rows, wrapMark, empty = 'No scored work yet.' }) => {
  if (rows.length === 0) {
    return <div className="text-xs text-slate-500">{empty}</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const dot =
          r.mark === null ? null : (
            <circle cx={x(r.mark)} cy={9} r={5} fill="#2d3f89" />
          );
        return (
          <div
            key={r.id}
            className="grid gap-2.5 items-center text-[13px] text-slate-700"
            style={{ gridTemplateColumns: 'minmax(90px,34%) 1fr 52px' }}
            title={r.title}
          >
            <span className="truncate min-w-0">{r.label}</span>
            <svg
              viewBox={`0 0 ${W} 18`}
              width="100%"
              height={18}
              role="img"
              aria-label={r.title ?? 'Class distribution'}
            >
              <line x1={PAD} x2={W - PAD} y1={9} y2={9} stroke="#e2e8f0" />
              {r.values.map((v, i) => (
                <circle
                  key={i}
                  cx={x(v)}
                  cy={9}
                  r={3}
                  fill="#64748b"
                  opacity={0.45}
                />
              ))}
              {dot && (wrapMark ? wrapMark(dot) : dot)}
            </svg>
            <span className="text-right font-bold text-slate-800">
              {r.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};
