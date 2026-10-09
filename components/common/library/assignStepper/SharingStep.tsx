import React, { useId } from 'react';
import { Share2 } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import {
  resolveSharingPlc,
  type SharingStepContext,
  type SharingStepValue,
} from './SharingStep.format';
import { tourAttr } from '@/config/tourAnchors';

interface SharingStepProps extends SharingStepContext {
  value: SharingStepValue;
  onChange: (next: SharingStepValue) => void;
}

export const SharingStep: React.FC<SharingStepProps> = ({
  value,
  onChange,
  plcs,
}) => {
  const selectId = useId();
  if (plcs.length === 0) return null;

  const effectivePlcId = resolveSharingPlc(value, plcs)?.id ?? '';
  const label =
    plcs.length === 1
      ? `Share results with ${plcs[0].name}`
      : 'Share results with a PLC';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 min-h-[2rem]">
        <span className="flex items-center gap-2 min-w-0">
          <Share2
            className="w-4 h-4 shrink-0 text-brand-blue-primary"
            aria-hidden="true"
          />
          <span className="text-sm font-bold text-brand-blue-dark">
            {label}
          </span>
        </span>
        <Toggle
          checked={value.plcMode}
          onChange={(plcMode) => onChange({ ...value, plcMode })}
          size="sm"
          label={label}
          anchor={tourAttr('sharing.plc-toggle')}
        />
      </div>
      {value.plcMode && plcs.length > 1 && (
        <div className="pl-6">
          <label htmlFor={selectId} className="sr-only">
            PLC
          </label>
          <select
            id={selectId}
            value={effectivePlcId}
            onChange={(e) => onChange({ ...value, plcId: e.target.value })}
            {...tourAttr('sharing.plc-select')}
            className="h-8 w-56 px-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary"
          >
            <option value="">Select a PLC…</option>
            {plcs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
