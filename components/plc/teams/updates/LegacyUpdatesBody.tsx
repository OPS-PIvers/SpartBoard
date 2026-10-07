// Updates for teammates without the Teams redesign: read, react and acknowledge; posting stays in the redesign.

import React from 'react';
import type { Plc } from '@/types';
import { UpdatesView } from './UpdatesView';
import { useTeamUpdatesData } from './useTeamUpdatesData';

export const LegacyUpdatesBody: React.FC<{ plc: Plc; isManager: boolean }> = ({
  plc,
  isManager,
}) => {
  const data = useTeamUpdatesData(plc, isManager);
  return <UpdatesView {...data} isLead={isManager} onPost={undefined} />;
};
