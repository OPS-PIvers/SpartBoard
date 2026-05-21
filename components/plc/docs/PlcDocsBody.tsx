import React from 'react';
import { Plc } from '@/types';
interface PlcDocsBodyProps {
  plc: Plc;
}
export const PlcDocsBody: React.FC<PlcDocsBodyProps> = () => (
  <div data-testid="plc-docs-stub" className="p-6 text-slate-400 text-sm">
    Docs (coming soon)
  </div>
);
