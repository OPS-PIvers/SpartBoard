import React from 'react';
import { Filter } from 'lucide-react';
import type { ClassRoster } from '@/types';
import { countRosterGroupMembers } from '@/utils/rosterGroups';

interface RosterGroupMenuItemsProps {
  roster: ClassRoster;
  /** The group currently selected on this roster, if it is the active one. */
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
}

/**
 * The indented group rows under one class in a class picker
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D8/D16). Shared by
 * `ActiveClassChip` and the Randomizer's `RandomClassContextButton`.
 *
 * This is a teacher-facing surface, so the group name is shown here — it must
 * never reach a widget's front face, which shows the member count instead.
 */
export const RosterGroupMenuItems: React.FC<RosterGroupMenuItemsProps> = ({
  roster,
  selectedGroupId,
  onSelect,
}) => (
  <>
    {(roster.groups ?? []).map((g) => {
      const isSelected = selectedGroupId === g.id;
      const size = countRosterGroupMembers(roster, g.id) ?? 0;
      return (
        <button
          key={g.id}
          type="button"
          role="menuitemradio"
          aria-checked={isSelected}
          onClick={() => onSelect(g.id)}
          className={`w-full flex items-center justify-between pl-7 pr-3 py-1.5 text-left transition-colors ${
            isSelected
              ? 'bg-brand-blue-lighter text-brand-blue-primary'
              : 'hover:bg-slate-50 text-slate-600'
          }`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Filter
              className="w-3 h-3 shrink-0 opacity-60"
              aria-hidden="true"
            />
            <span
              className={`text-xs truncate ${isSelected ? 'font-black' : 'font-semibold'}`}
            >
              {g.name}
            </span>
          </span>
          <span
            className={`text-[10px] font-bold tabular-nums ml-2 px-2 py-0.5 rounded-full shrink-0 ${
              isSelected
                ? 'bg-white text-brand-blue-primary border border-brand-blue-light'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {size}
          </span>
        </button>
      );
    })}
  </>
);
