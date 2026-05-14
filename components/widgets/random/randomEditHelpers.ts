import { RandomGroup } from '@/types';

export const UNASSIGNED_ZONE_ID = '__unassigned__';

/** Append a name to a group, deduping (drag from same group → no-op). */
function appendToGroup(group: RandomGroup, name: string): RandomGroup {
  if (group.names.includes(name)) return group;
  return { ...group, names: [...group.names, name] };
}

/** Remove a name from a group's `names` array. */
function removeFromGroup(group: RandomGroup, name: string): RandomGroup {
  if (!group.names.includes(name)) return group;
  return { ...group, names: group.names.filter((n) => n !== name) };
}

/** Find the group id that currently holds `name`, or null if unassigned. */
export function findGroupIdForName(
  groups: RandomGroup[] | null | undefined,
  name: string
): string | null {
  if (!groups) return null;
  for (const g of groups) {
    if (g.names.includes(name)) return g.id ?? null;
  }
  return null;
}

/**
 * Move a name into the target zone, removing it from any other group.
 * `targetGroupId === UNASSIGNED_ZONE_ID` means the unassigned tray; the
 * unassigned list is managed separately, so for that case we just drop the
 * name from its current group and let the caller union it into `unassigned`.
 */
export function moveNameToGroup(
  groups: RandomGroup[],
  name: string,
  targetGroupId: string
): RandomGroup[] {
  const cleaned = groups.map((g) => removeFromGroup(g, name));
  if (targetGroupId === UNASSIGNED_ZONE_ID) return cleaned;
  return cleaned.map((g) =>
    g.id === targetGroupId ? appendToGroup(g, name) : g
  );
}

/** Toggle membership of `name` in `lockedNames`. */
export function toggleLockedName(
  lockedNames: string[] | undefined,
  name: string
): string[] {
  const current = lockedNames ?? [];
  return current.includes(name)
    ? current.filter((n) => n !== name)
    : [...current, name];
}

/** Remove names from `lockedNames` (e.g. when a student is sent to the tray). */
export function clearLockedNames(
  lockedNames: string[] | undefined,
  names: string[]
): string[] {
  if (!lockedNames || lockedNames.length === 0) return [];
  const drop = new Set(names);
  return lockedNames.filter((n) => !drop.has(n));
}

export interface RebalanceArgs {
  /** Existing groups whose ids/order are preserved. Locked names stay put. */
  currentGroups: RandomGroup[];
  /** Names that should stay in their current group. */
  lockedNames: string[];
  /** Freshly generated groups containing the unlocked pool. */
  freshGroups: RandomGroup[];
}

/**
 * Merge freshly randomized unlocked-students into the existing group
 * skeleton, keeping locked names in their original groups (and preserving
 * each group's `id` so dashboard.sharedGroups / Scoreboard linkages hold).
 *
 * Strategy: for each existing group, keep only its locked names. Then
 * distribute the names from `freshGroups[i]` into existing group `i`,
 * padding by index. If `freshGroups` has fewer groups than `currentGroups`
 * (e.g. all students were locked) any unmatched current groups just keep
 * their locked-only contents.
 */
export function mergeLockedWithFresh({
  currentGroups,
  lockedNames,
  freshGroups,
}: RebalanceArgs): RandomGroup[] {
  const lockedSet = new Set(lockedNames);
  return currentGroups.map((g, i) => {
    const kept = g.names.filter((n) => lockedSet.has(n));
    const fresh = freshGroups[i]?.names ?? [];
    // Dedupe: if a fresh name somehow matches a locked name (shouldn't,
    // since the caller excludes locked from the pool) keep the locked-side
    // appearance.
    const deduped = fresh.filter((n) => !kept.includes(n));
    return { ...g, names: [...kept, ...deduped] };
  });
}

/**
 * Shuffle re-randomize that preserves locked indices. Locked names keep
 * their position; unlocked names get shuffled among the remaining slots.
 */
export function shuffleWithLocks(
  current: string[],
  lockedNames: string[]
): string[] {
  const lockedSet = new Set(lockedNames);
  const lockedSlots = new Map<number, string>();
  const unlocked: string[] = [];
  current.forEach((name, i) => {
    if (lockedSet.has(name)) {
      lockedSlots.set(i, name);
    } else {
      unlocked.push(name);
    }
  });
  for (let i = unlocked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unlocked[i], unlocked[j]] = [unlocked[j], unlocked[i]];
  }
  const result: string[] = [];
  let unlockedIdx = 0;
  for (let i = 0; i < current.length; i++) {
    if (lockedSlots.has(i)) {
      result.push(lockedSlots.get(i) as string);
    } else {
      result.push(unlocked[unlockedIdx++]);
    }
  }
  return result;
}

/** Collect all names currently appearing across a list of groups. */
export function collectGroupNames(groups: RandomGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) out.push(...g.names);
  return out;
}
