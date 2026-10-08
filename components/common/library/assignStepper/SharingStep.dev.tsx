import React, { useState } from 'react';
import type { Plc } from '@/types';
import { SharingStep } from './SharingStep';
import {
  formatSharingValue,
  type SharingStepValue,
} from './SharingStep.format';

const TWO_PLCS: Plc[] = [
  { id: 'plc-a', name: 'Grade 8 Science PLC' },
  { id: 'plc-b', name: 'Orono MS Science' },
] as Plc[];
const ONE_PLC: Plc[] = [TWO_PLCS[0]];

const Demo: React.FC<{ plcs: Plc[]; initial: SharingStepValue }> = ({
  plcs,
  initial,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">
        {formatSharingValue(value, { plcs })}
      </p>
      <SharingStep value={value} onChange={setValue} plcs={plcs} />
    </div>
  );
};

const SharingStepDev = {
  title: 'Sharing step',
  render: () => (
    <div className="space-y-6 max-w-xl">
      <Demo plcs={TWO_PLCS} initial={{ plcMode: false, plcId: '' }} />
      <Demo plcs={TWO_PLCS} initial={{ plcMode: true, plcId: 'plc-a' }} />
      <Demo plcs={ONE_PLC} initial={{ plcMode: true, plcId: '' }} />
    </div>
  ),
};

export default SharingStepDev;
