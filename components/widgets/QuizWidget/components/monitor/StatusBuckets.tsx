import React from 'react';
import { MonitorData } from './useMonitorData';

export type BucketKey = 'notStarted' | 'inProgress' | 'done';

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'notStarted', label: 'Not started' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

interface StatusBucketsProps {
  counts: MonitorData['counts'];
  needsHelpCount: number;
  openBucket: BucketKey | null;
  onToggle: (key: BucketKey) => void;
}

export const StatusBuckets: React.FC<StatusBucketsProps> = ({
  counts,
  needsHelpCount,
  openBucket,
  onToggle,
}) => (
  <div
    className="grid grid-cols-3"
    style={{ gap: 'min(10px, 2.5cqmin)' }}
    role="group"
    aria-label="Student status"
  >
    {BUCKETS.map(({ key, label }) => {
      const selected = openBucket === key;
      return (
        <button
          key={key}
          onClick={() => onToggle(key)}
          aria-expanded={selected}
          className={`flex flex-col items-center rounded-xl border transition-colors ${
            selected
              ? 'bg-brand-blue-lighter border-brand-blue-primary'
              : 'bg-white border-brand-gray-lighter hover:border-brand-blue-light'
          }`}
          style={{ padding: 'min(12px, 3cqmin) min(6px, 1.5cqmin)' }}
        >
          <span
            className="font-sans font-bold text-brand-blue-dark tabular-nums"
            style={{ fontSize: 'min(26px, 10cqmin)', lineHeight: 1.1 }}
          >
            {counts[key]}
          </span>
          <span
            className="font-sans font-medium text-brand-gray-primary"
            style={{ fontSize: 'min(11px, 3.8cqmin)' }}
          >
            {label}
          </span>
          {key === 'inProgress' && needsHelpCount > 0 && (
            <span
              className="font-sans font-semibold text-brand-red-primary"
              style={{
                fontSize: 'min(10px, 3.5cqmin)',
                marginTop: 'min(2px, 0.5cqmin)',
              }}
            >
              {needsHelpCount} need{needsHelpCount === 1 ? 's' : ''} help
            </span>
          )}
        </button>
      );
    })}
  </div>
);
