/**
 * Dual-read helper for unified class targeting on assignments.
 *
 * Context: assignment documents historically stored ClassLink sourcedIds under
 * `classIds[]` (ClassLink-only) or local roster names under `periodNames[]`
 * (local-only). After the roster-as-single-source-of-truth unification,
 * new assignments write `rosterIds[]` — rosters imported from ClassLink carry
 * their own `classlinkClassId` metadata, and rosters imported from admin
 * test classes carry `testClassId`, so the student SSO gate still works.
 *
 * Legacy in-flight assignments are NOT migrated; they continue reading via
 * their existing `classIds`/`periodNames` fields until they expire.
 *
 * Precedence:
 *   1. `rosterIds`   → resolve via rosters, derive everything fresh.
 *   2. `classIds`    → legacy ClassLink targeting (SSO claim match).
 *   3. `periodNames` → legacy local-roster targeting (name match).
 *   4. none          → untargeted (code/PIN-only join).
 */

import type { ClassRoster, Student } from '@/types';

/** Minimal shape of any assignment doc's class-targeting fields. */
export interface AssignmentTargetInput {
  rosterIds?: string[];
  classIds?: string[];
  periodNames?: string[];
}

export interface ResolvedAssignmentTargets {
  /** Roster IDs backing this assignment (empty for legacy docs). */
  rosterIds: string[];
  /**
   * Class identifiers to write onto the session doc for the student SSO gate.
   * Sourced from `classlinkClassId` (real ClassLink rosters) and `testClassId`
   * (admin test-class imports); both end up in this same array since the
   * student-side claim and Firestore gate read a single `classIds[]` field.
   * Empty when no selected roster carries either (purely local targeting —
   * SSO students get blocked, PIN students still pass).
   */
  classIds: string[];
  /** Period names (local roster names) for PIN-flow routing. */
  periodNames: string[];
  /** Union of students across all targeted rosters (new path only). */
  students: Student[];
  /**
   * Which branch resolved the targets. Useful for telemetry / debug logs so
   * we can tell when the legacy paths stop being hit and the code can retire.
   */
  source: 'rosterIds' | 'classIds' | 'periodNames' | 'none';
}

/**
 * Core "rosters → session shape" derivation shared by
 * `resolveAssignmentTargets` (lookup-then-derive) and
 * `deriveSessionTargetsFromRosters` (already-resolved rosters). Centralizing
 * the logic guarantees the two paths stay in lock-step on de-duplication
 * rules and makes the cap on Firestore's `array-contains-any` budget a
 * single-source-of-truth concern.
 *
 * Dedup rationale:
 * - `classIds`: two rosters can share the same `classlinkClassId` (teacher
 *   imported the same ClassLink class twice under different local names);
 *   we'd otherwise waste the Firestore rules' 20-entry budget. Test-class
 *   `testClassId` slugs share this output array because the student-side SSO
 *   gate (`MyAssignmentsPage` queries + `firestore.rules`) keys on a single
 *   `classIds[]` field — the cloud function (`studentLoginV1`) populates the
 *   same claim from either source. Collisions are not possible: ClassLink
 *   sourcedIds are opaque OneRoster identifiers, test-class IDs are
 *   admin-chosen slugs.
 * - `students`: a student enrolled in two targeted classes shouldn't appear
 *   twice in the session student list.
 * - `periodNames`: two local rosters can share a name; the student app keys
 *   its post-PIN period picker on the string, so duplicates collide on
 *   React keys.
 */
function deriveTargetsFromRosterList(rosters: ClassRoster[]): {
  rosterIds: string[];
  classIds: string[];
  periodNames: string[];
  students: Student[];
} {
  const classIds = Array.from(
    new Set(
      rosters
        .flatMap((r) => [r.classlinkClassId, r.testClassId])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const studentsById = new Map<string, Student>();
  for (const r of rosters) {
    for (const s of r.students) {
      if (!studentsById.has(s.id)) studentsById.set(s.id, s);
    }
  }

  return {
    rosterIds: rosters.map((r) => r.id),
    classIds,
    periodNames: Array.from(new Set(rosters.map((r) => r.name))),
    students: Array.from(studentsById.values()),
  };
}

/**
 * Resolve an assignment's class targets against the current rosters list.
 * Never throws — unknown roster IDs or missing legacy fields simply drop
 * through to the next precedence level or to the untargeted result.
 */
export function resolveAssignmentTargets(
  assignment: AssignmentTargetInput,
  rosters: ClassRoster[]
): ResolvedAssignmentTargets {
  // 1. New path: rosterIds on the assignment doc.
  if (assignment.rosterIds && assignment.rosterIds.length > 0) {
    const byId = new Map(rosters.map((r) => [r.id, r]));
    const matched = assignment.rosterIds
      .map((id) => byId.get(id))
      .filter((r): r is ClassRoster => r !== undefined);

    return { ...deriveTargetsFromRosterList(matched), source: 'rosterIds' };
  }

  // 2. Legacy ClassLink path.
  if (assignment.classIds && assignment.classIds.length > 0) {
    return {
      rosterIds: [],
      classIds: [...assignment.classIds],
      periodNames: [],
      students: [],
      source: 'classIds',
    };
  }

  // 3. Legacy local path.
  if (assignment.periodNames && assignment.periodNames.length > 0) {
    return {
      rosterIds: [],
      classIds: [],
      periodNames: [...assignment.periodNames],
      students: [],
      source: 'periodNames',
    };
  }

  // 4. Untargeted.
  return {
    rosterIds: [],
    classIds: [],
    periodNames: [],
    students: [],
    source: 'none',
  };
}

/**
 * Map legacy ClassLink `sourcedId`s (from pre-unification per-app config keys
 * like `lastClassIdsByQuizId`) to rosterIds by matching against the current
 * rosters' `classlinkClassId` metadata. Used to seed the picker default for
 * teachers whose configs predate the unified `lastRosterIdsBy*` keys.
 *
 * Partial matches are returned — if the teacher had three legacy sourcedIds
 * but only re-imported two of them, the other one is silently dropped rather
 * than refusing the preselection wholesale (better UX than all-or-nothing).
 *
 * Tie-break: if two rosters share the same `classlinkClassId` (teacher
 * imported the same ClassLink class twice), the first one wins — which is
 * stable per Firestore's default name-ordered roster stream.
 *
 * Returns an empty array when the teacher hasn't (re-)imported the ClassLink
 * class at all — we can't recover a preselection that no longer has a roster.
 */
export function mapLegacyClassIdsToRosterIds(
  legacyClassIds: string[] | undefined,
  rosters: ClassRoster[]
): string[] {
  if (!legacyClassIds || legacyClassIds.length === 0) return [];
  // First-wins: earlier rosters in the array win the mapping. Rosters are
  // typically streamed name-ordered from Firestore, so this is stable.
  const rosterByClassLinkId = new Map<string, string>();
  for (const r of rosters) {
    if (r.classlinkClassId && !rosterByClassLinkId.has(r.classlinkClassId)) {
      rosterByClassLinkId.set(r.classlinkClassId, r.id);
    }
  }
  const mapped: string[] = [];
  const seen = new Set<string>();
  for (const cid of legacyClassIds) {
    const rosterId = rosterByClassLinkId.get(cid);
    if (rosterId && !seen.has(rosterId)) {
      mapped.push(rosterId);
      seen.add(rosterId);
    }
  }
  return mapped;
}

/**
 * Convenience: given selected rosters (e.g., from the picker at assignment-
 * create time), derive the fields a session doc needs. Mirrors the
 * `rosterIds` branch of `resolveAssignmentTargets` but skips the lookup step
 * since the caller already holds the full roster objects.
 */
export function deriveSessionTargetsFromRosters(
  rosters: ClassRoster[]
): Pick<
  ResolvedAssignmentTargets,
  'rosterIds' | 'classIds' | 'periodNames' | 'students'
> {
  return deriveTargetsFromRosterList(rosters);
}
