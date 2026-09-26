import React from 'react';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import type { ImportDestination } from '../utils/glTransfer';

const OPTIONS: { value: ImportDestination; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'building', label: 'Building' },
];

export const ImportDestinationPicker: React.FC<{
  canChoose: boolean;
  destination: ImportDestination;
  hasTour: boolean;
  onChange: (destination: ImportDestination) => void;
}> = ({ canChoose, destination, hasTour, onChange }) => {
  const tourStaysInert = hasTour && destination === 'personal';
  if (!canChoose && !tourStaysInert) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {canChoose && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600">
            Import to
          </span>
          <SegmentedControl<ImportDestination>
            role="radiogroup"
            ariaLabel="Import to"
            value={destination}
            onChange={onChange}
            options={OPTIONS}
          />
        </div>
      )}
      {tourStaysInert && (
        <p className="text-xs text-amber-700">
          Live tour steps only run from a building set.
        </p>
      )}
    </div>
  );
};
