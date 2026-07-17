import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

interface BuildingSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  activeClassName?: string;
  /**
   * Optional prefix used to stamp a stable `id` on each tab button
   * (`${idPrefix}-tab-${buildingId}`). Callers can then wire their content
   * panel with `role="tabpanel"` + `aria-labelledby` to restore the full
   * ARIA tablist → tabpanel association.
   */
  idPrefix?: string;
}

export const BuildingSelector: React.FC<BuildingSelectorProps> = ({
  selectedId,
  onSelect,
  activeClassName = 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm',
  idPrefix,
}) => {
  const buildings = useAdminBuildings();
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar"
      role="tablist"
      aria-label="Building Selection"
    >
      {buildings.map((building) => (
        <button
          key={building.id}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${building.id}` : undefined}
          aria-selected={selectedId === building.id}
          onClick={() => onSelect(building.id)}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap transition-colors ${
            selectedId === building.id
              ? activeClassName
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {building.name}
        </button>
      ))}
    </div>
  );
};
