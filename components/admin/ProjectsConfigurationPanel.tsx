import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import { Toggle } from '@/components/common/Toggle';
import type { BuildingProjectsDefaults, ProjectsGlobalConfig } from '@/types';

interface ProjectsConfigurationPanelProps {
  config: ProjectsGlobalConfig;
  onChange: (newConfig: ProjectsGlobalConfig) => void;
}

export const ProjectsConfigurationPanel: React.FC<
  ProjectsConfigurationPanelProps
> = ({ config, onChange }) => {
  const buildings = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(buildings);
  const canonicalId = canonicalBuildingId(selectedBuildingId);

  const buildingDefaults = canonicalizeBuildingKeyedRecord(
    config.buildingDefaults ?? {}
  );
  const current: BuildingProjectsDefaults = buildingDefaults[canonicalId] ?? {
    buildingId: canonicalId,
  };

  const update = (updates: Partial<BuildingProjectsDefaults>) =>
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [canonicalId]: { ...current, ...updates },
      },
    });

  return (
    <div className="space-y-4">
      <BuildingSelector
        selectedId={selectedBuildingId}
        onSelect={setSelectedBuildingId}
        idPrefix="projects-config"
      />

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        <label className="flex items-start justify-between gap-4 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">
              New projects show every group&apos;s progress to students
            </span>
          </span>
          <Toggle
            checked={current.defaultShowStatusToStudents ?? true}
            onChange={(next) => update({ defaultShowStatusToStudents: next })}
            label="New projects show every group's progress to students"
          />
        </label>
      </div>
    </div>
  );
};
