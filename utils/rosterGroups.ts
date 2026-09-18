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

/**
 * Ids of a pool group's members, or `null` for "no pool — use the whole class".
 * `null` covers the gate being off, no group chosen, and a group deleted out
 * from under the widget (assumption 4: fall back to the whole class silently).
 */
export function rosterGroupMemberIds(
  roster: ClassRoster | undefined,
  groupId: string | null | undefined,
  enabled: boolean
): Set<string> | null {
  if (!enabled || !groupId || !roster) return null;
  const group = roster.groups?.find((g) => g.id === groupId);
  return group ? new Set(group.studentIds) : null;
}

/** True when any roster has a saved group, i.e. the submenu has something to show. */
export function anyRosterHasGroups(rosters: ClassRoster[]): boolean {
  return rosters.some((r) => (r.groups?.length ?? 0) > 0);
}
