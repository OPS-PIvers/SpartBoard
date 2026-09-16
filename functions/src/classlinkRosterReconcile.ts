/**
 * Server-side ClassLink roster reconcile — the engine behind the nightly sync.
 *
 * Deliberately diverges from the client's `components/classes/
 * mergeClassLinkStudents.ts`, which is additive-only ("never removes"). A
 * teacher clicking Sync is present to notice a departure; an unattended
 * nightly job is the only thing that will ever catch one, so this also
 * REMOVES students whose `classLinkSourcedId` upstream no longer returns.
 * The two copies are intentionally not in lockstep — see the divergence note
 * on `reconcileClassLinkStudents`.
 *
 * Mirrored rather than imported: the functions package has its own tsconfig
 * with no path back to the repo root (same constraint documented in
 * `studentIdentity.ts`).
 */

import { ClassLinkStudent } from './classlinkShared';

/** Mirror of the repo-root `Student` (types.ts). Drive roster file payload. */
export interface SyncStudent {
  id: string;
  firstName: string;
  lastName: string;
  pin: string;
  classLinkSourcedId?: string;
  email?: string;
  restrictedStudentIds?: string[];
}

/** Why a reconcile refused to produce a writable result. */
export type ReconcileBlock = 'empty-upstream' | 'mass-removal';

export interface ReconcileChange {
  firstName: string;
  lastName: string;
}

export interface ReconcileResult {
  /** Merged roster. Equals `existing` untouched whenever `blocked` is set. */
  students: SyncStudent[];
  added: ReconcileChange[];
  removed: ReconcileChange[];
  /** Matched an existing row via the stable sourcedId. */
  matched: number;
  /** Matched by name and upgraded to a stable sourcedId link this run. */
  linked: number;
  /** Set when the result was refused; `students` is then the input unchanged. */
  blocked?: ReconcileBlock;
}

/**
 * Refuse to remove more than this share of a roster's SIS-linked students in
 * one run. A ClassLink outage that returns a short or empty class must not be
 * able to empty a teacher's roster overnight.
 */
export const MASS_REMOVAL_THRESHOLD = 0.5;

const normalizeNameKey = (first: string, last: string): string =>
  `${first.trim()}|${last.trim()}`.toLowerCase();

/**
 * Assign PINs to students that lack one, skipping `reserved`.
 *
 * Mirrors `utils/rosterPins.ts` with one addition: the caller passes the PINs
 * of students being removed in the SAME run, so a departure and an arrival on
 * the same night never hand the leaver's printed PIN to the newcomer.
 */
export function assignPins(
  students: SyncStudent[],
  reserved: ReadonlySet<string> = new Set()
): SyncStudent[] {
  const used = new Set<string>(reserved);
  for (const s of students) {
    if (s.pin) used.add(s.pin);
  }

  let next = 1;
  const takeNextAvailablePin = (): string => {
    let candidate = String(next).padStart(2, '0');
    while (used.has(candidate)) {
      next += 1;
      candidate = String(next).padStart(2, '0');
    }
    used.add(candidate);
    next += 1;
    return candidate;
  };

  return students.map((s) =>
    s.pin ? s : { ...s, pin: takeNextAvailablePin() }
  );
}

/**
 * Reconcile a Drive roster against a ClassLink class membership list.
 *
 * Additive half mirrors the client merge exactly: match on
 * `classLinkSourcedId` first (survives an upstream rename), then on
 * normalized first+last name, consuming each local row at most once so two
 * same-named incoming students cannot both claim it. Matched students keep
 * their local `id` and `pin`; a name match is stamped with the sourcedId.
 *
 * Subtractive half is the divergence from the client: a student carrying a
 * `classLinkSourcedId` that upstream did not return has left the section and
 * is dropped. Students with NO sourcedId are never touched — aides and
 * hand-added kids are not SIS-governed and a sync must not judge them.
 *
 * Returns `blocked` (and `existing` unchanged) rather than throwing when the
 * upstream payload looks untrustworthy, so the caller can log and skip.
 */
export function reconcileClassLinkStudents(
  existing: readonly SyncStudent[],
  classLinkStudents: readonly ClassLinkStudent[]
): ReconcileResult {
  const upstream = classLinkStudents.filter(
    (s): s is ClassLinkStudent & { sourcedId: string } => !!s.sourcedId
  );

  // An empty class is far more likely to be a OneRoster hiccup than a real
  // section with no students, and acting on it would delete every SIS student.
  if (upstream.length === 0) {
    return {
      students: [...existing],
      added: [],
      removed: [],
      matched: 0,
      linked: 0,
      blocked: 'empty-upstream',
    };
  }

  const result: SyncStudent[] = existing.map((s) => ({ ...s }));

  const bySourcedId = new Map<string, number>();
  result.forEach((s, i) => {
    if (s.classLinkSourcedId) bySourcedId.set(s.classLinkSourcedId, i);
  });

  const byName = new Map<string, number[]>();
  result.forEach((s, i) => {
    const key = normalizeNameKey(s.firstName, s.lastName);
    const queue = byName.get(key);
    if (queue) queue.push(i);
    else byName.set(key, [i]);
  });

  const consumed = new Set<number>();
  const added: ReconcileChange[] = [];
  let matched = 0;
  let linked = 0;

  for (const cls of upstream) {
    const sourcedIndex = bySourcedId.get(cls.sourcedId);
    if (sourcedIndex !== undefined && !consumed.has(sourcedIndex)) {
      consumed.add(sourcedIndex);
      matched += 1;
      if (cls.email && !result[sourcedIndex].email) {
        result[sourcedIndex] = { ...result[sourcedIndex], email: cls.email };
      }
      continue;
    }

    const key = normalizeNameKey(cls.givenName ?? '', cls.familyName ?? '');
    const queue = byName.get(key);
    let nameMatchIndex: number | undefined;
    if (queue) {
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (candidate !== undefined && !consumed.has(candidate)) {
          nameMatchIndex = candidate;
          break;
        }
      }
    }
    if (nameMatchIndex !== undefined) {
      consumed.add(nameMatchIndex);
      linked += 1;
      result[nameMatchIndex] = {
        ...result[nameMatchIndex],
        classLinkSourcedId: cls.sourcedId,
        ...(cls.email && !result[nameMatchIndex].email
          ? { email: cls.email }
          : {}),
      };
      continue;
    }

    result.push({
      id: crypto.randomUUID(),
      firstName: cls.givenName ?? '',
      lastName: cls.familyName ?? '',
      pin: '',
      classLinkSourcedId: cls.sourcedId,
      ...(cls.email ? { email: cls.email } : {}),
    });
    added.push({
      firstName: cls.givenName ?? '',
      lastName: cls.familyName ?? '',
    });
  }

  // Departures: SIS-linked locally, absent upstream. Computed against the
  // pre-merge roster only — rows appended above are upstream by definition.
  const upstreamIds = new Set(upstream.map((s) => s.sourcedId));
  const sisLinkedCount = existing.filter((s) => s.classLinkSourcedId).length;
  const departing = result.filter(
    (s) => s.classLinkSourcedId && !upstreamIds.has(s.classLinkSourcedId)
  );

  // No guard needed for `sisLinkedCount === 0`: a departing row must carry a
  // pre-existing sourcedId, so an unlinked roster yields no departures at all.
  if (
    departing.length > 0 &&
    departing.length / sisLinkedCount > MASS_REMOVAL_THRESHOLD
  ) {
    return {
      students: [...existing],
      added: [],
      removed: [],
      matched: 0,
      linked: 0,
      blocked: 'mass-removal',
    };
  }

  const departingIds = new Set(departing.map((s) => s.id));
  const kept = result.filter((s) => !departingIds.has(s.id));

  return {
    students: assignPins(kept, new Set(departing.map((s) => s.pin))),
    added,
    removed: departing.map((s) => ({
      firstName: s.firstName,
      lastName: s.lastName,
    })),
    matched,
    linked,
  };
}
