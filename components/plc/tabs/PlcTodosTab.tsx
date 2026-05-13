import React from 'react';
import { Plc } from '@/types';
import { TodosBody } from '../bodies/TodosBody';

interface PlcTodosTabProps {
  plc: Plc;
}

/**
 * Tab-mode wrapper around the shared `TodosBody`. See `PlcNotesTab` for
 * the design rationale — the body is rendered directly by v2 grid tiles
 * and indirectly by this legacy tab shim.
 */
export const PlcTodosTab: React.FC<PlcTodosTabProps> = ({ plc }) => {
  return <TodosBody plc={plc} />;
};
