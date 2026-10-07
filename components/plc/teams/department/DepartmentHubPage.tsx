// Department landing page `hub` (TEAMS_REDESIGN T23, T24).

import React from 'react';
import { useAuth } from '@/context/useAuth';
import type { TeamPageProps } from '@/components/plc/teams/types';
import { DepartmentHubView } from './DepartmentHubView';
import { useDepartmentHubData } from './useDepartmentHubData';

export default function DepartmentHubPage(props: TeamPageProps) {
  const { canAccessFeature } = useAuth();
  if (!canAccessFeature('teams-redesign')) return null;
  return <DepartmentHubInner {...props} />;
}

const DepartmentHubInner: React.FC<TeamPageProps> = ({
  plc,
  layout,
  isLead,
}) => {
  const { view, modals } = useDepartmentHubData(plc, layout, isLead);
  return (
    <>
      <DepartmentHubView {...view} />
      {modals}
    </>
  );
};

export { DepartmentHubPage };
