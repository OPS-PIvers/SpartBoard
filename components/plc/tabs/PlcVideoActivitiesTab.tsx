import React from 'react';
import { Plc } from '@/types';
import { PlcVideoActivitiesBody } from '../bodies/PlcVideoActivitiesBody';

interface PlcVideoActivitiesTabProps {
  plc: Plc;
}

/**
 * Tab-mode wrapper around the shared `PlcVideoActivitiesBody`. Mirrors
 * the `PlcQuizLibraryTab` shape — placement-only shim used by the legacy
 * v1 dashboard tab routing. The v2 grid renders the body directly inside
 * a tile (or its fullscreen expansion).
 */
export const PlcVideoActivitiesTab: React.FC<PlcVideoActivitiesTabProps> = ({
  plc,
}) => {
  return <PlcVideoActivitiesBody plc={plc} />;
};
