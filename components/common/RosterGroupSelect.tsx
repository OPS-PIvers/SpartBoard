import React from 'react';
import type { ClassRoster } from '@/types';
import { countRosterGroupMembers } from '@/utils/rosterGroups';

interface RosterGroupSelectProps {
  roster: ClassRoster | undefined;
  /** `null` means the whole class. */
  value: string | null;
  onChange: (groupId: string | null) => void;
  /** Label for the "no group" option, in the caller's own i18n convention. */
  wholeClassLabel: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * Pool picker for widgets with no class chip to hang a submenu off
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D8/D22).
 *
 * A teacher-only surface, so the group name is shown; the widget's front face
 * must still show a count instead. Renders nothing when the class has no
 * saved groups, so it can be mounted unconditionally.
 */
export const RosterGroupSelect: React.FC<RosterGroupSelectProps> = ({
  roster,
  value,
  onChange,
  wholeClassLabel,
  id,
  ariaLabel,
}) => {
  const groups = roster?.groups ?? [];
  if (groups.length === 0) return null;
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-3 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary"
    >
      <option value="">{wholeClassLabel}</option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {`${group.name} (${countRosterGroupMembers(roster, group.id) ?? 0})`}
        </option>
      ))}
    </select>
  );
};
