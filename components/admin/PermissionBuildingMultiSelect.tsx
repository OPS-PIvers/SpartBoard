// Building limit for a feature permission; nothing picked means every building.

import React from 'react';
import { useAdminBuildingsState } from '@/hooks/useAdminBuildings';
import {
  canonicalBuildingId,
  canonicalizeBuildingIds,
} from '@/config/buildings';
import { ChecklistSelect } from '@/components/common/ChecklistSelect';

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
  const { buildings, isLoading } = useAdminBuildingsState();
  // selectedIds may hold a legacy long-form id that would never match a canonical building id.
  const canonicalSelectedIds = canonicalizeBuildingIds(selectedIds);
  // Deleted buildings stay listed so admins can clear them; hidden while loading so valid ones never read as unknown.
  const orphans = isLoading
    ? []
    : canonicalSelectedIds.filter((id) => !buildings.some((b) => b.id === id));

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          {label}
        </p>
      )}
      {/* no-tour-anchor: admin-only building limit, no teacher tour points here */}
      <ChecklistSelect
        label={label ?? 'Buildings'}
        options={[
          ...buildings.map((b) => ({ id: b.id, label: b.name })),
          ...orphans.map((id) => ({
            id,
            label: `Unknown building (${id})`,
          })),
        ]}
        selected={canonicalSelectedIds}
        onToggle={(id, checked) => {
          const canonicalId = canonicalBuildingId(id);
          onChange(
            checked
              ? [...canonicalSelectedIds, canonicalId]
              : canonicalSelectedIds.filter((b) => b !== canonicalId)
          );
        }}
        emptyText="All buildings"
        className="w-full max-w-sm"
      />
    </div>
  );
};
