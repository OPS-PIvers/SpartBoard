import React from 'react';
import { BUILDINGS } from '@/config/buildings';

interface BuildingSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  activeClassName?: string;
}

export const BuildingSelector: React.FC<BuildingSelectorProps> = ({
  selectedId,
  onSelect,
  activeClassName = 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm',
}) => {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar"
      role="tablist"
      aria-label="Building Selection"
    >
      {BUILDINGS.map((building) => (
        <button
          key={building.id}
          type="button"
          role="tab"
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
