// Updates for teammates without the Teams redesign: read, react and acknowledge; posting stays in the redesign.

import React from 'react';
import type { PlcUpdatesApi } from '@/hooks/usePlcUpdates';
import type { Plc } from '@/types';
import { UpdatesView } from './UpdatesView';
import { useTeamUpdatesData } from './useTeamUpdatesData';

export const LegacyUpdatesBody: React.FC<{
  plc: Plc;
  isManager: boolean;
  source: PlcUpdatesApi;
}> = ({ plc, isManager, source }) => {
  const data = useTeamUpdatesData(plc, isManager, { source });
  return <UpdatesView {...data} isLead={isManager} onPost={undefined} />;
};
