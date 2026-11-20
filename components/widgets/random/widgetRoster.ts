import type { ClassRoster, RandomConfig, RandomGroup } from '@/types';

/** The class this widget draws from: its own pick, else the board's active class. */
export function randomRosterId(
  config: Pick<RandomConfig, 'rosterId'>,
  rosters: Pick<ClassRoster, 'id'>[],
  activeRosterId: string | null
): string | null {
  const own = config.rosterId;
  // An empty list is still loading; a missing id after load is a deleted or unshared class.
  if (own && (rosters.length === 0 || rosters.some((r) => r.id === own))) {
    return own;
  }
  return activeRosterId;
}

function groupStudentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const group of value as unknown[]) {
    if (typeof group !== 'object' || group === null) continue;
    const studentIds = (group as RandomGroup).studentIds;
    if (Array.isArray(studentIds)) ids.push(...studentIds);
  }
  return ids;
}

/** For a widget saved before it kept its own class: the class its current groups came from. */
export function inferRandomRosterId(
  config: Pick<RandomConfig, 'lastResult' | 'jigsawHomeGroups'>,
  rosters: Pick<ClassRoster, 'id' | 'students'>[]
): string | null {
  const ids = [
    ...groupStudentIds(config.lastResult),
    ...groupStudentIds(config.jigsawHomeGroups),
  ];
  if (ids.length === 0) return null;
  // Best overlap wins, so a student who left the class since doesn't block the match.
  let best: { id: string; hits: number } | null = null;
  for (const r of rosters) {
    const own = new Set(r.students.map((s) => s.id));
    const hits = ids.filter((id) => own.has(id)).length;
    if (hits > (best?.hits ?? 0)) best = { id: r.id, hits };
  }
  return best && best.hits * 2 > ids.length ? best.id : null;
}
