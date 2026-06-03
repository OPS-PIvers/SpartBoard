import React from 'react';
import { Plc } from '@/types';
import { PlcVideoActivitiesTabsBody } from '@/components/plc/bodies/PlcVideoActivitiesTabsBody';

interface PlcVideoActivitiesTabProps {
  plc: Plc;
}

/**
 * Tab-mode wrapper around the shared `PlcVideoActivitiesTabsBody`. Mirrors
 * the `PlcQuizLibraryTab` shape — the body owns the Library / In-progress /
 * Completed sub-tab shell, and this tab is a placement-only shim used by the
 * legacy v1 dashboard section routing.
 */
export const PlcVideoActivitiesTab: React.FC<PlcVideoActivitiesTabProps> = ({
  plc,
}) => {
  return <PlcVideoActivitiesTabsBody plc={plc} />;
};
