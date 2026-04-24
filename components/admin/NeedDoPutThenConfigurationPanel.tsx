import React from 'react';
import { ListTodo } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';

export interface NeedDoPutThenGlobalConfig {
  buildingDefaults?: Record<string, Record<string, unknown>>;
}

interface Props {
  config: NeedDoPutThenGlobalConfig;
}

export const NeedDoPutThenConfigurationPanel: React.FC<Props> = ({
  config,
}) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const building = BUILDINGS.find((b) => b.id === selectedBuildingId);
  const hasBuildingEntry = Boolean(
    config.buildingDefaults?.[selectedBuildingId]
  );

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Need / Do / Put / Then Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 shrink-0">
            <ListTodo className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700">
              No building-level defaults yet
            </p>
            <p className="text-xxs text-slate-500 leading-snug mt-1">
              Teachers at <b>{building?.name ?? 'this building'}</b> configure
              the Need / Do / Put / Then widget per-instance today.
              Building-wide defaults (preset materials, turn-in destinations,
              common next-up options) can be added here in a future release.
            </p>
            {hasBuildingEntry && (
              <p className="text-xxs text-slate-400 mt-2 italic">
                Stored defaults exist for this building but are not yet consumed
                by the widget.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
