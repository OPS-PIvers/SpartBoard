import React from 'react';
import { Plc } from '@/types';
import { PlcSharedBoardsBody } from '../bodies/PlcSharedBoardsBody';

interface PlcSharedBoardsTabProps {
  plc: Plc;
}

/**
 * Tab-mode wrapper around the shared `PlcSharedBoardsBody`. Mirrors the
 * `PlcQuizLibraryTab` shape — placement-only shim used by the legacy
 * v1 dashboard tab routing. The v2 grid renders the body directly
 * inside a tile (or its fullscreen expansion).
 */
export const PlcSharedBoardsTab: React.FC<PlcSharedBoardsTabProps> = ({
  plc,
}) => {
  return <PlcSharedBoardsBody plc={plc} />;
};
