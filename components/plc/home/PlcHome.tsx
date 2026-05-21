import React from 'react';
import { Plc } from '@/types';
import type { PlcSectionId } from '../sections';
interface PlcHomeProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}
export const PlcHome: React.FC<PlcHomeProps> = () => (
  <div data-testid="plc-home-stub" className="p-6 text-slate-400 text-sm">
    Home (coming soon)
  </div>
);
