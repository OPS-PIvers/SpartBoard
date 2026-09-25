import React, { useMemo } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { Toggle } from '@/components/common/Toggle';
import { Layout } from 'lucide-react';

interface DockDefaultsPanelProps {
  config: { dockDefaults: Record<string, boolean> };
  onChange: (dockDefaults: Record<string, boolean>) => void;
}

export const DockDefaultsPanel: React.FC<DockDefaultsPanelProps> = ({
  config,
  onChange,
}) => {
  const buildings = useAdminBuildings();
  // useAdminBuildings() can return a legacy long-form id; key dockDefaults off the canonical id.
  const dockDefaults = useMemo(
    () => canonicalizeBuildingKeyedRecord(config.dockDefaults ?? {}),
    [config.dockDefaults]
  );

  const handleToggle = (buildingId: string) => {
    const canonicalId = canonicalBuildingId(buildingId);
    onChange({
      ...dockDefaults,
      [canonicalId]: !dockDefaults[canonicalId],
    });
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 mb-6">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        <Layout className="w-4 h-4 text-brand-blue-primary" />
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
          Dock Defaults
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {buildings.map((building) => (
          <div
            key={building.id}
            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
          >
            <span className="text-xs font-medium text-slate-700">
              {building.name}
            </span>
            <Toggle
              checked={!!dockDefaults[canonicalBuildingId(building.id)]}
              onChange={() => handleToggle(building.id)}
              label={`Dock on ${building.name} by default`}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
