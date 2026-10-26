// Hides work from classes a teacher removed from an assignment; the docs stay and return if the class is re-added. Mirrors utils/sessionClassFilter.ts; tests/utils/sessionClassFilterParity.test.ts keeps them equal.

/** The targeting fields every assignable session kind carries. */
export interface SessionClassTargets {
  classIds?: unknown;
  classId?: unknown;
  periodNames?: unknown;
  classPeriodByClassId?: unknown;
  periodAccess?: unknown;
  periodName?: unknown;
  /** Classes the teacher took off this assignment; written by a class change. */
  removedClasses?: unknown;
}

/** A response's class markers: `classId` for SSO and per-period joins, `classPeriod` for PIN joins. */
export interface ResponseClassMarkers {
  classId?: unknown;
  classPeriod?: unknown;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];

const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

const nonEmpty = (v: unknown): string =>
  typeof v === 'string' && v.length > 0 ? v : '';

/** Builds a predicate that hides a response only when it names a class the teacher removed and has not re-added. */
export function sessionClassPredicate(
  session: SessionClassTargets | null | undefined
): (response: ResponseClassMarkers) => boolean {
  const removed = record(session?.removedClasses);
  const removedIds = new Set(strings(removed.classIds));
  const removedPeriods = new Set(strings(removed.periodNames));
  if (!session || (removedIds.size === 0 && removedPeriods.size === 0))
    return () => true;
  const classIds = strings(session.classIds);
  const legacyClassId = nonEmpty(session.classId);
  const periodAccess = record(session.periodAccess);
  const activeIds = new Set<string>([
    ...(classIds.length > 0 ? classIds : legacyClassId ? [legacyClassId] : []),
    ...Object.keys(periodAccess),
  ]);
  const periodNames = strings(session.periodNames);
  const legacyPeriod = nonEmpty(session.periodName);
  const activePeriods = new Set<string>(
    periodNames.length > 0 ? periodNames : legacyPeriod ? [legacyPeriod] : []
  );
  for (const row of Object.values(periodAccess)) {
    const label = nonEmpty(record(row).label);
    if (label) activePeriods.add(label);
  }
  return (response) => {
    const classId = nonEmpty(response.classId);
    const period = nonEmpty(response.classPeriod);
    const named =
      (classId && removedIds.has(classId)) ||
      (period && removedPeriods.has(period));
    if (!named) return true;
    return (
      (!!classId && activeIds.has(classId)) ||
      (!!period && activePeriods.has(period))
    );
  };
}

/** The responses that belong to a class the session still targets, plus any with no class. */
export function filterToSessionClasses<R extends ResponseClassMarkers>(
  responses: readonly R[],
  session: SessionClassTargets | null | undefined
): R[] {
  const keep = sessionClassPredicate(session);
  const out = responses.filter(keep);
  return out.length === responses.length ? (responses as R[]) : out;
}
