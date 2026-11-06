import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { SCORE_DISTRIBUTION_BANDS } from '@/utils/scoreColor';

const LABEL_STYLE = { fontSize: 'min(10px, 3.5cqmin)' } as const;

/** The Results home's hero card: a label, the big number and a line under it. */
export const ResultsSummaryCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  note?: React.ReactNode;
}> = ({ label, value, detail, note }) => (
  <div
    className="bg-brand-blue-lighter rounded-lg"
    style={{ padding: 'min(12px, 3cqmin)' }}
  >
    <p
      className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
      style={LABEL_STYLE}
    >
      {label}
    </p>
    <p
      className="font-sans font-bold text-brand-blue-dark tabular-nums"
      style={{ fontSize: 'min(26px, 10cqmin)', lineHeight: 1.15 }}
    >
      {value}
    </p>
    <p
      className="text-brand-blue-dark/70"
      style={{ fontSize: 'min(11px, 3.8cqmin)' }}
    >
      {detail}
    </p>
    {note}
  </div>
);

/** Score distribution bars over whole-number percents. */
export const ScoreDistributionBars: React.FC<{ scores: readonly number[] }> = ({
  scores,
}) => (
  <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
    <p
      className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
      style={LABEL_STYLE}
    >
      Score distribution
    </p>
    {SCORE_DISTRIBUTION_BANDS.map((b) => {
      const count = scores.filter((s) => s >= b.min && s <= b.max).length;
      const pct =
        scores.length > 0 ? Math.round((count / scores.length) * 100) : 0;
      return (
        <div key={b.label}>
          <div
            className="flex items-center justify-between"
            style={{
              gap: 'min(8px, 2cqmin)',
              marginBottom: 'min(2px, 0.5cqmin)',
            }}
          >
            <span
              className="font-sans text-brand-gray-dark"
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              {b.label}
            </span>
            <span
              className="text-brand-gray-primary tabular-nums shrink-0"
              style={{ fontSize: 'min(11px, 3.8cqmin)' }}
            >
              {count} · {pct}%
            </span>
          </div>
          <div
            className="bg-brand-gray-lightest rounded-full overflow-hidden"
            style={{ height: 'min(8px, 2cqmin)' }}
          >
            <div
              className={`h-full rounded-full ${b.color}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    })}
  </div>
);

/** A Results home row that opens a drill-down screen. */
export const ResultsDrillRow: React.FC<{
  label: string;
  detail: string;
  onClick: () => void;
  anchor?: TourAnchorAttrs;
}> = ({ label, detail, onClick, anchor }) => (
  <button
    onClick={onClick}
    {...anchor}
    className="flex items-center justify-between bg-white border border-brand-gray-lighter rounded-lg hover:border-brand-blue-light transition-colors text-left"
    style={{
      padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
      gap: 'min(8px, 2cqmin)',
    }}
  >
    <p
      className="font-sans font-semibold text-brand-gray-dark truncate"
      style={{ fontSize: 'min(13px, 4.5cqmin)' }}
    >
      {label}
    </p>
    <span
      className="flex items-center shrink-0 text-brand-gray-primary"
      style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
    >
      {detail}
      <ChevronRight
        className="text-brand-gray-light"
        aria-hidden
        style={{
          width: 'min(14px, 4.5cqmin)',
          height: 'min(14px, 4.5cqmin)',
        }}
      />
    </span>
  </button>
);
