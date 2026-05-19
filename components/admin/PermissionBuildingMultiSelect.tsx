/**
 * Generic building multi-select for global feature permissions.
 *
 * Empty `selectedIds` displays an "All buildings" pill — the feature
 * applies org-wide. Non-empty means the feature is restricted to users
 * whose `selectedBuildings` overlap this list.
 *
 * Mirrors the chip styling of `BuildingSelector.tsx` (single-select) so
 * the admin UI feels consistent. Unselected buildings render as
 * outlined chips with a "+" affordance; selected buildings render as
 * filled brand-blue chips with a "×" affordance.
 */

import React from 'react';
import { Plus, X, Building2 } from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

interface Props {
  selectedIds: string[];
  onChange: (next: string[]) => void;
  /** Optional label shown above the control. */
  label?: string;
}

export const PermissionBuildingMultiSelect: React.FC<Props> = ({
  selectedIds,
  onChange,
  label,
}) => {
  const buildings = useAdminBuildings();
  const selectedSet = new Set(selectedIds);

  const toggle = (id: string): void => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((b) => b !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          {label}
        </p>
      )}
      {selectedIds.length === 0 && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold border border-slate-200">
          <Building2 className="w-3 h-3" />
          All buildings
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {buildings.map((building) => {
          const isSelected = selectedSet.has(building.id);
          return (
            <button
              key={building.id}
              type="button"
              onClick={() => toggle(building.id)}
              aria-label={
                isSelected ? `Remove ${building.name}` : `Add ${building.name}`
              }
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                isSelected
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm hover:bg-brand-blue-dark'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {isSelected ? (
                <X className="w-3 h-3" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              {building.name}
            </button>
          );
        })}
        {/* Render orphan (deleted) building IDs so admins can clear them */}
        {selectedIds
          .filter((id) => !buildings.some((b) => b.id === id))
          .map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(selectedIds.filter((b) => b !== id))}
              aria-label={`Remove unknown building ${id}`}
              aria-pressed="true"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-dashed border-amber-400 bg-amber-50 text-amber-800 transition-colors hover:bg-amber-100"
              title={`Building "${id}" no longer exists. Click to remove.`}
            >
              <X className="w-3 h-3" />
              Unknown building ({id})
            </button>
          ))}
      </div>
    </div>
  );
};
