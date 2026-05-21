import React from 'react';
import { Plc } from '@/types';
interface PlcSharedDataBodyProps {
  plc: Plc;
}
export const PlcSharedDataBody: React.FC<PlcSharedDataBodyProps> = () => (
  <div
    data-testid="plc-shared-data-stub"
    className="p-6 text-slate-400 text-sm"
  >
    Shared Data (coming soon)
  </div>
);
