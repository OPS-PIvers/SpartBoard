// Department landing page `hub` (TEAMS_REDESIGN T23, T24).

import type { TeamPageProps } from '@/components/plc/teams/types';
import { DepartmentHubView } from './DepartmentHubView';
import { useDepartmentHubData } from './useDepartmentHubData';

export default function DepartmentHubPage({
  plc,
  layout,
  isLead,
}: TeamPageProps) {
  const { view, modals } = useDepartmentHubData(plc, layout, isLead);
  return (
    <>
      <DepartmentHubView {...view} />
      {modals}
    </>
  );
}

export { DepartmentHubPage };
