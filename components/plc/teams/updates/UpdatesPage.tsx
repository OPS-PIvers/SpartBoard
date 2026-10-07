// Updates rail page (T27); the registry maps page id `updates` here.

import React from 'react';
import { UpdatesView } from './UpdatesView';
import { useTeamUpdatesData } from './useTeamUpdatesData';
import type { TeamPageProps } from '@/components/plc/teams/types';

export default function UpdatesPage({ plc, isLead }: TeamPageProps) {
  const data = useTeamUpdatesData(plc, isLead);
  return (
    <UpdatesView
      {...data}
      isLead={isLead}
      onPost={isLead ? data.onPost : undefined}
    />
  );
}
