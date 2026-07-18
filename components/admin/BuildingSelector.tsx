import React, { useRef } from 'react';
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
  /** Override the tablist's accessible name (default: "Building Selection"). */
  ariaLabel?: string;
}

export const BuildingSelector: React.FC<BuildingSelectorProps> = ({
  selectedId,
  onSelect,
  activeClassName = 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm',
  idPrefix,
  ariaLabel = 'Building Selection',
}) => {
  const buildings = useAdminBuildings();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = buildings.length - 1;
    let target = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      target = index === last ? 0 : index + 1;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      target = index === 0 ? last : index - 1;
    } else if (e.key === 'Home') {
      target = 0;
    } else if (e.key === 'End') {
      target = last;
    }
    if (target !== -1) {
      e.preventDefault();
      buttonRefs.current[target]?.focus();
      onSelect(buildings[target].id);
    }
  };

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar"
      role="tablist"
      aria-label={ariaLabel}
    >
      {buildings.map((building, index) => (
        <button
          key={building.id}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${building.id}` : undefined}
          aria-selected={selectedId === building.id}
          tabIndex={selectedId === building.id ? 0 : -1}
          onClick={() => onSelect(building.id)}
          onKeyDown={(e) => handleKeyDown(e, index)}
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
