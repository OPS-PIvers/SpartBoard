// Hides work from classes a teacher removed from an assignment; the docs stay and return if the class is re-added. Mirrors utils/sessionClassFilter.ts; tests/utils/sessionClassFilterParity.test.ts keeps them equal.

/** The targeting fields every assignable session kind carries. */
export interface SessionClassTargets {
  classIds?: unknown;
  classId?: unknown;
  periodNames?: unknown;
  classPeriodByClassId?: unknown;
  periodAccess?: unknown;
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

/** Builds a predicate that keeps a response unless it names a class the session no longer targets. */
export function sessionClassPredicate(
  session: SessionClassTargets | null | undefined
): (response: ResponseClassMarkers) => boolean {
  if (!session) return () => true;
  const classIds = strings(session.classIds);
  const legacyClassId = nonEmpty(session.classId);
  const periodAccess = record(session.periodAccess);
  const activeIds = new Set<string>([
    ...(classIds.length > 0 ? classIds : legacyClassId ? [legacyClassId] : []),
    ...Object.keys(periodAccess),
  ]);
  const periodMap = record(session.classPeriodByClassId);
  const activePeriods = new Set<string>(strings(session.periodNames));
  for (const [id, label] of Object.entries(periodMap)) {
    if (activeIds.has(id) && nonEmpty(label))
      activePeriods.add(label as string);
  }
  for (const row of Object.values(periodAccess)) {
    const label = nonEmpty(record(row).label);
    if (label) activePeriods.add(label);
  }
  if (activeIds.size === 0 && activePeriods.size === 0) return () => true;
  return (response) => {
    const classId = nonEmpty(response.classId);
    if (classId && activeIds.size > 0) return activeIds.has(classId);
    const period = nonEmpty(response.classPeriod);
    if (period && activePeriods.size > 0) return activePeriods.has(period);
    return true;
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
