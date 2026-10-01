import React, { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useOrganization } from '@/hooks/useOrganization';
import { useGradebookAdmin } from '@/hooks/useGradebookAdmin';
import type { GradebookScaleOption } from '@/hooks/useGradebookSettings';
import { canonicalBuildingId } from '@/config/buildings';
import { useUndoToast } from '@/components/gradebook/settings/useUndoToast';
import { DistrictScaleCard } from './DistrictScaleCard';
import { GradingPeriodSetsCard } from './GradingPeriodSetsCard';
import { DistrictConfigsCard } from './DistrictConfigsCard';

/** Admin Settings > Gradebook: district scale (D17), grading periods (D18), district configurations (D16). */
export const GradebookAdminPanel: React.FC = () => {
  const { orgId } = useAuth();
  const { organization } = useOrganization(orgId);
  const admin = useGradebookAdmin();
  const adminBuildings = useAdminBuildings();
  const { notify, fail, toastNode } = useUndoToast('GradebookAdmin');
  const buildings = useMemo(
    () =>
      adminBuildings.map((b) => ({
        id: canonicalBuildingId(b.id),
        name: b.name,
      })),
    [adminBuildings]
  );
  const orgName = organization?.name?.trim();
  const scaleTitle = orgName ? `${orgName} district scale` : 'District scale';
  const scaleOptions: GradebookScaleOption[] = [
    { value: 'district', label: scaleTitle, scale: admin.scale },
    { value: 'custom', label: 'Custom', scale: null },
  ];

  if (admin.loading) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="p-6 pb-10 flex flex-col gap-4 max-w-[1120px]">
      <DistrictScaleCard
        title={scaleTitle}
        scale={admin.scale}
        onSave={admin.saveScale}
        notify={notify}
        fail={fail}
      />
      <GradingPeriodSetsCard
        sets={admin.periodSets}
        buildings={buildings}
        newId={() => admin.newDocId('periods')}
        onSave={admin.savePeriodSet}
        onDelete={admin.deletePeriodSet}
        notify={notify}
        fail={fail}
      />
      <DistrictConfigsCard
        configs={admin.districtConfigs}
        buildings={buildings}
        scaleOptions={scaleOptions}
        newId={() => admin.newDocId('district')}
        onSave={(id, c) => admin.saveDistrictConfig(id, c)}
        onDelete={admin.deleteDistrictConfig}
        notify={notify}
        fail={fail}
      />
      {toastNode}
    </div>
  );
};
