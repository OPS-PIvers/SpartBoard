import React, { useMemo } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
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
  const dockDefaults = useMemo(
    () => config.dockDefaults ?? {},
    [config.dockDefaults]
  );

  const handleToggle = (buildingId: string) => {
    onChange({
      ...dockDefaults,
      [buildingId]: !dockDefaults[buildingId],
    });
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 mb-6">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        <Layout className="w-4 h-4 text-brand-blue-primary" />
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
            Dock Defaults
          </h4>
          <p className="text-xxs text-slate-500 mt-0.5">
            Select which buildings should have this widget on the dock by
            default for new users.
          </p>
        </div>
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
              checked={!!dockDefaults[building.id]}
              onChange={() => handleToggle(building.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
