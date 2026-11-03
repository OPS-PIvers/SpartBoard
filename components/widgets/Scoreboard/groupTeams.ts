import type {
  RandomConfig,
  RandomGroup,
  ScoreboardTeam,
  SharedGroup,
} from '@/types';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';

/** The Randomizer's current groups, or null when it has no groups to show. */
export const randomizerGroups = (
  config: RandomConfig | undefined
): RandomGroup[] | null => {
  const result = config?.lastResult;
  if (!Array.isArray(result) || result.length === 0) return null;
  const first: unknown = result[0];
  if (typeof first !== 'object' || first === null || !('names' in first)) {
    return null;
  }
  return result as RandomGroup[];
};

/** One team per group, in group order; a team keeps its id and score when its group slot survives a regroup. */
export const teamsFromGroups = (
  groups: RandomGroup[],
  sharedGroups: SharedGroup[] | undefined,
  current: ScoreboardTeam[],
  groupName: (position: number) => string
): ScoreboardTeam[] => {
  const linked = current.filter((team) => team.linkedGroupId);
  const groupIds = new Set(groups.flatMap((g) => (g.id ? [g.id] : [])));
  const claimed = new Set<string>();
  const byId = (gid: string | undefined) =>
    gid ? linked.find((team) => team.linkedGroupId === gid) : undefined;
  // A group with a fresh id takes over the slot whose old group is gone.
  const bySlot = (i: number) => {
    const team = linked[i];
    return team &&
      !groupIds.has(team.linkedGroupId ?? '') &&
      !claimed.has(team.id)
      ? team
      : undefined;
  };
  return groups.map((group, i) => {
    const existing = byId(group.id) ?? bySlot(i);
    if (existing) claimed.add(existing.id);
    const shared = group.id
      ? sharedGroups?.find((sg) => sg.id === group.id)
      : undefined;
    const sharedName = shared?.name.trim();
    const team: ScoreboardTeam = {
      id: existing?.id ?? `group-${group.id ?? i + 1}`,
      name: sharedName && sharedName.length > 0 ? sharedName : groupName(i + 1),
      score: existing?.score ?? 0,
      color:
        shared?.color ??
        existing?.color ??
        SCOREBOARD_COLORS[i % SCOREBOARD_COLORS.length],
    };
    if (group.id) team.linkedGroupId = group.id;
    return team;
  });
};

/** True when two team lists would render and save the same. */
export const sameTeams = (a: ScoreboardTeam[], b: ScoreboardTeam[]): boolean =>
  a.length === b.length &&
  a.every((team, i) => {
    const other = b[i];
    return (
      team.id === other.id &&
      team.name === other.name &&
      team.score === other.score &&
      team.color === other.color &&
      team.linkedGroupId === other.linkedGroupId &&
      team.linkedRosterGroupId === other.linkedRosterGroupId
    );
  });
