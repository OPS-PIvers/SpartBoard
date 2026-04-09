import React from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { BUILDINGS } from '@/config/buildings';
import { WidgetData } from '@/types';

interface WidgetBuildingSelectorProps {
  widget: WidgetData;
}

/**
 * Compact building selector for widget settings panels.
 * Only renders when the user has 2+ buildings selected.
 * Persists the choice to `widget.buildingId` via updateWidget.
 */
export const WidgetBuildingSelector: React.FC<WidgetBuildingSelectorProps> = ({
  widget,
}) => {
  const { selectedBuildings = [] } = useAuth();
  const { updateWidget } = useDashboard();
  const effectiveBuildingId = useWidgetBuildingId(widget);

  // Only show when user works across multiple buildings
  if (selectedBuildings.length < 2) return null;

  // Resolve the buildings the user has selected
  const userBuildings = BUILDINGS.filter((b) =>
    selectedBuildings.includes(b.id)
  );

  return (
    <div className="mb-3">
      <div
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1.5"
        id={`building-label-${widget.id}`}
      >
        <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
        Building
      </div>
      <div
        className="flex gap-1.5 flex-wrap"
        role="radiogroup"
        aria-labelledby={`building-label-${widget.id}`}
      >
        {userBuildings.map((building) => {
          const isActive = building.id === effectiveBuildingId;
          return (
            <button
              key={building.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() =>
                updateWidget(widget.id, { buildingId: building.id })
              }
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${
                isActive
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                  : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {building.name}
              <span
                className={`ml-1.5 text-xxs font-black uppercase tracking-wider ${
                  isActive ? 'text-white/60' : 'text-slate-500'
                }`}
              >
                {building.gradeLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
