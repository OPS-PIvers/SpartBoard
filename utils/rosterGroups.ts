/**
 * Roster-group helpers shared by the class pickers
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D8/D16).
 */
import type { ClassRoster } from '@/types';

/** Members still on the roster; `null` when the group no longer exists. */
export function countRosterGroupMembers(
  roster: ClassRoster | undefined,
  groupId: string
): number | null {
  const group = roster?.groups?.find((g) => g.id === groupId);
  if (!roster || !group) return null;
  const onRoster = new Set(roster.students.map((s) => s.id));
  return group.studentIds.filter((id) => onRoster.has(id)).length;
}

/** True when any roster has a saved group, i.e. the submenu has something to show. */
export function anyRosterHasGroups(rosters: ClassRoster[]): boolean {
  return rosters.some((r) => (r.groups?.length ?? 0) > 0);
}
