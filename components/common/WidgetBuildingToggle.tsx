import React, { useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { canonicalBuildingId } from '@/config/buildings';
import { WidgetData } from '@/types';

interface WidgetBuildingToggleProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

/**
 * Compact inline building toggle for the settings panel header.
 * Shows grade-level labels (e.g. "6-8 | 9-12") as a small segmented control.
 * Only renders when the user has 2+ valid buildings selected.
 * Uses useContext directly (instead of useAuth) so it gracefully returns null
 * when rendered outside an AuthProvider (e.g. in tests).
 */
export const WidgetBuildingToggle: React.FC<WidgetBuildingToggleProps> = ({
  widget,
  updateWidget,
}) => {
  const auth = useContext(AuthContext);
  const selectedBuildings = auth?.selectedBuildings ?? [];
  const BUILDINGS = useAdminBuildings();

  // Normalize legacy long-form IDs to canonical short-form so the toggle
  // renders for users (or test fixtures) whose AuthContext data hasn't yet
  // been canonicalized. AuthContext itself canonicalizes on read in the
  // app, but defensive normalization here keeps the component robust to
  // any non-AuthContext source that hands in raw stored IDs.
  const canonicalSelected = new Set(
    selectedBuildings.map((id) => canonicalBuildingId(id))
  );
  const userBuildings = BUILDINGS.filter((b) => canonicalSelected.has(b.id));

  if (userBuildings.length < 2) return null;

  const widgetBuildingCanonical = widget.buildingId
    ? canonicalBuildingId(widget.buildingId)
    : undefined;
  const effectiveBuildingId =
    widgetBuildingCanonical &&
    userBuildings.some((b) => b.id === widgetBuildingCanonical)
      ? widgetBuildingCanonical
      : userBuildings[0]?.id;

  return (
    <div
      className="flex items-center bg-slate-200/80 rounded-lg p-0.5 shrink-0"
      role="radiogroup"
      aria-label="Building"
    >
      {userBuildings.map((building) => {
        const isActive = building.id === effectiveBuildingId;
        return (
          <button
            key={building.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${building.gradeLabel} – ${building.name}`}
            title={building.name}
            onClick={() => {
              if (isActive) return;
              updateWidget(widget.id, { buildingId: building.id });
            }}
            className={`px-2 py-0.5 text-xxs font-bold rounded-md transition-all ${
              isActive
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {building.gradeLabel}
          </button>
        );
      })}
    </div>
  );
};
