// Hides work from classes a teacher removed from an assignment; the docs stay and return if the class is re-added. Mirrored in functions/src/sessionClassFilter.ts.

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

const LINKED_SECTION_PREFIX = 'schoology:';

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
  const activePeriods = new Set<string>(strings(session.periodNames));
  const legacyPeriod = nonEmpty(session.periodName);
  if (legacyPeriod) activePeriods.add(legacyPeriod);
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

/** The targeting fields alone, as a stable string, so callers rebuild the predicate only when classes change. */
export function targetingKey(
  session: SessionClassTargets | null | undefined
): string {
  if (!session) return '';
  const labels: Record<string, unknown> = {};
  for (const [key, row] of Object.entries(record(session.periodAccess)))
    labels[key] = { label: record(row).label ?? null };
  return JSON.stringify([
    session.classIds ?? null,
    session.classId ?? null,
    session.periodNames ?? null,
    session.classPeriodByClassId ?? null,
    labels,
    session.periodName ?? null,
    session.removedClasses ?? null,
  ]);
}

/** Inverse of `targetingKey`. */
export function targetsFromKey(key: string): SessionClassTargets | null {
  if (!key) return null;
  const [
    classIds,
    classId,
    periodNames,
    classPeriodByClassId,
    periodAccess,
    periodName,
    removedClasses,
  ] = JSON.parse(key) as unknown[];
  return {
    classIds,
    classId,
    periodNames,
    classPeriodByClassId,
    periodAccess,
    periodName,
    removedClasses,
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

export interface LinkedSectionTargets {
  classIds: string[];
  periodNames: string[];
  classPeriodByClassId: Record<string, string>;
}

/** Carries linked Schoology sections into a class change, since the class step never lists them; a section paired with a removed class goes with it. */
export function withLinkedSections(
  current: SessionClassTargets | null | undefined,
  next: LinkedSectionTargets
): LinkedSectionTargets {
  const currentIds = strings(current?.classIds);
  const linked = currentIds.filter((id) =>
    id.startsWith(LINKED_SECTION_PREFIX)
  );
  if (linked.length === 0) return next;
  const currentMap = record(current?.classPeriodByClassId);
  const currentPeriods = new Set(strings(current?.periodNames));
  const classLabels = new Set(
    currentIds
      .filter((id) => !id.startsWith(LINKED_SECTION_PREFIX))
      .map((id) => nonEmpty(currentMap[id]))
      .filter(Boolean)
  );
  const classIds = [...next.classIds];
  const periodNames = [...next.periodNames];
  const classPeriodByClassId = { ...next.classPeriodByClassId };
  for (const id of linked) {
    const label = nonEmpty(currentMap[id]);
    const pairedLabel = label && classLabels.has(label);
    if (pairedLabel && !periodNames.includes(label)) continue;
    if (!classIds.includes(id)) classIds.push(id);
    if (!label) continue;
    classPeriodByClassId[id] = label;
    if (currentPeriods.has(label) && !periodNames.includes(label))
      periodNames.push(label);
  }
  return { classIds, periodNames, classPeriodByClassId };
}

export interface RemovedClasses {
  classIds: string[];
  periodNames: string[];
}

/** The session's removed-class record after a class change: newly dropped classes join it, re-added ones leave it. */
export function nextRemovedClasses(
  current: SessionClassTargets | null | undefined,
  next: {
    classIds: string[];
    periodNames: string[];
    periodAccessKeys: string[];
  },
  removedRosterNames: readonly string[]
): RemovedClasses {
  const prior = record(current?.removedClasses);
  const currentMap = record(current?.classPeriodByClassId);
  const currentRows = record(current?.periodAccess);
  const nextIds = new Set([...next.classIds, ...next.periodAccessKeys]);
  const nextPeriods = new Set(next.periodNames);
  const droppedIds = [
    ...strings(current?.classIds),
    ...Object.keys(currentRows),
  ].filter((id) => !nextIds.has(id) && !id.startsWith(LINKED_SECTION_PREFIX));
  const droppedPeriods = [
    ...removedRosterNames,
    ...droppedIds.map((id) => nonEmpty(currentMap[id])),
    ...droppedIds.map((id) => nonEmpty(record(currentRows[id]).label)),
  ];
  const classIds = [
    ...new Set([...strings(prior.classIds), ...droppedIds]),
  ].filter((id) => !nextIds.has(id));
  const periodNames = [
    ...new Set([...strings(prior.periodNames), ...droppedPeriods]),
  ].filter((n) => n.length > 0 && !nextPeriods.has(n));
  return { classIds, periodNames };
}
