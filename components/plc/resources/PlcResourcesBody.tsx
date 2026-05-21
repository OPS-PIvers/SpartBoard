import React from 'react';
import { Plc } from '@/types';
interface PlcResourcesBodyProps {
  plc: Plc;
}
export const PlcResourcesBody: React.FC<PlcResourcesBodyProps> = () => (
  <div data-testid="plc-resources-stub" className="p-6 text-slate-400 text-sm">
    Resources (coming soon)
  </div>
);
