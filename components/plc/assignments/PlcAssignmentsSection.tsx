import React from 'react';
import { Plc } from '@/types';
interface PlcAssignmentsSectionProps {
  plc: Plc;
}
export const PlcAssignmentsSection: React.FC<
  PlcAssignmentsSectionProps
> = () => (
  <div
    data-testid="plc-assignments-stub"
    className="p-6 text-slate-400 text-sm"
  >
    Assignments (coming soon)
  </div>
);
