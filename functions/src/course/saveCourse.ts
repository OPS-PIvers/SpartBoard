// saveCourseV1 logic (docs/plans/COURSE_AND_AGENDA.md D21, §4.1): the only writer of Courses and their student and family copies.
import { randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type * as admin from '../firebaseAdmin';
import {
  CLASS_PAGES_COLLECTION,
  CLASS_PAGE_TEACHERS_SUBCOLLECTION,
  COURSES_SUBCOLLECTION,
  COURSE_DECK_SHARING,
  COURSE_MAX_CLASSES,
  COURSE_MAX_NAME_LENGTH,
  COURSE_MAX_PER_TEACHER,
  COURSE_PAGE_LINKS_COLLECTION,
  FAMILY_PAGES_COLLECTION,
  cleanCourseAgenda,
  cleanCourseText,
  cleanPinnedLinks,
  isCourseDocId,
  type ClassPageCopy,
  type Course,
  type CourseDeckSharing,
  type CoursePageLink,
  type FamilyPage,
  type SaveCourseReply,
  type SaveCourseRequest,
} from './shared.gen';

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;

export const COURSE_FEATURE_ID = 'course-agenda';

export interface CourseCaller {
  uid: string;
  /** Verified staff address (staffEmailFromToken), or null. */
  email: string | null;
  name: string | null;
}

export interface CourseDeps {
  now: () => number;
  newId: () => string;
  /** ClassLink classes the address teaches; null when not ClassLink staff; throws when ClassLink can't answer. */
  taughtClassIds: (email: string) => Promise<Set<string> | null>;
  /** The mock-class gate Focus and assignments use (isTestClassAuthority). */
  isTestClassAuthority: (
    db: Firestore,
    email: string,
    orgId: string
  ) => Promise<boolean>;
  resolveOrgId: (db: Firestore, email: string) => Promise<string | null>;
  featureGranted: (
    db: Firestore,
    email: string,
    uid: string
  ) => Promise<boolean>;
}

/** 22 URL-safe characters, unguessable; used for Course, link and share ids. */
export function newCourseId(): string {
  return randomBytes(16).toString('base64url');
}

const bad = (message: string): never => {
  throw new HttpsError('invalid-argument', message);
};

const coursePath = (uid: string, id: string) =>
  `users/${uid}/${COURSES_SUBCOLLECTION}/${id}`;
const classPagePath = (classId: string, uid: string) =>
  `${CLASS_PAGES_COLLECTION}/${classId}/${CLASS_PAGE_TEACHERS_SUBCOLLECTION}/${uid}`;
const linkPath = (linkId: string) =>
  `${COURSE_PAGE_LINKS_COLLECTION}/${linkId}`;
const familyPath = (shareId: string) => `${FAMILY_PAGES_COLLECTION}/${shareId}`;

/** Firestore paths can't hold '/', and ClassLink ids never do. */
const isClassId = (id: unknown): id is string =>
  typeof id === 'string' &&
  id.length > 0 &&
  id.length <= 300 &&
  !id.includes('/') &&
  id !== '.' &&
  id !== '..';

function readCourse(id: string, data: Data | undefined): Course | null {
  if (!data) return null;
  const rosterIds = Array.isArray(data.rosterIds)
    ? (data.rosterIds as unknown[]).filter(isCourseDocId)
    : [];
  const map: Record<string, string> = {};
  if (data.rosterClassIds && typeof data.rosterClassIds === 'object') {
    for (const [r, c] of Object.entries(
      data.rosterClassIds as Record<string, unknown>
    )) {
      if (rosterIds.includes(r) && isClassId(c)) map[r] = c;
    }
  }
  const fam = data.familyLink as Data | null | undefined;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    rosterIds,
    agenda: cleanCourseAgenda(data.agenda),
    pinnedLinks: cleanPinnedLinks(data.pinnedLinks),
    familyLink:
      fam && typeof fam.shareId === 'string'
        ? { shareId: fam.shareId, on: fam.on === true }
        : null,
    linkId: typeof data.linkId === 'string' ? data.linkId : '',
    rosterClassIds: map,
    deckCheck: (data.deckCheck as Course['deckCheck']) ?? null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

const classIdsOf = (c: Course) => [...new Set(Object.values(c.rosterClassIds))];

/** Every doc a Course puts outside the teacher's own folder, as path to data. */
function copiesOf(
  uid: string,
  c: Course,
  teacherName: string,
  now: number
): Map<string, Data> {
  const out = new Map<string, Data>();
  const ids = classIdsOf(c);
  for (const classId of ids) {
    const copy: ClassPageCopy = {
      courseName: c.name,
      teacherName,
      agenda: c.agenda,
      pinnedLinks: c.pinnedLinks,
      linkId: c.linkId,
      updatedAt: now,
    };
    out.set(classPagePath(classId, uid), copy as unknown as Data);
  }
  const link: CoursePageLink = { classIds: ids };
  out.set(linkPath(c.linkId), link as unknown as Data);
  if (c.familyLink?.on) {
    const page: FamilyPage = {
      courseName: c.name,
      teacherName,
      agenda: c.agenda,
      pinnedLinks: c.pinnedLinks,
      updatedAt: now,
    };
    out.set(familyPath(c.familyLink.shareId), page as unknown as Data);
  }
  return out;
}

async function requireTeacher(
  db: Firestore,
  caller: CourseCaller | null,
  deps: CourseDeps,
  gated: boolean
): Promise<{ uid: string; email: string; name: string }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!caller.email)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  if (gated && !(await deps.featureGranted(db, caller.email, caller.uid)))
    throw new HttpsError(
      'permission-denied',
      'Courses are not turned on for your account.'
    );
  return {
    uid: caller.uid,
    email: caller.email,
    name: cleanCourseText(caller.name, COURSE_MAX_NAME_LENGTH),
  };
}

/** Class ids the server confirms for each roster; rosters it can't confirm are left out. */
async function confirmClasses(
  db: Firestore,
  teacher: { uid: string; email: string },
  rosters: Map<string, Data>,
  known: Record<string, string>,
  deps: CourseDeps
): Promise<{ map: Record<string, string>; classLinkUnavailable: boolean }> {
  const map: Record<string, string> = {};
  let classLinkUnavailable = false;
  const wantsClassLink = [...rosters.values()].some((r) =>
    isClassId(r.classlinkClassId)
  );
  let taught: Set<string> | null = null;
  if (wantsClassLink) {
    try {
      taught = await deps.taughtClassIds(teacher.email);
    } catch {
      classLinkUnavailable = true;
    }
  }
  const wantsTest = [...rosters.values()].some(
    (r) => !isClassId(r.classlinkClassId) && isClassId(r.testClassId)
  );
  let testOrg: string | null = null;
  if (wantsTest) {
    const orgId = await deps.resolveOrgId(db, teacher.email);
    if (orgId && (await deps.isTestClassAuthority(db, teacher.email, orgId)))
      testOrg = orgId;
  }
  for (const [rosterId, r] of rosters) {
    if (isClassId(r.classlinkClassId)) {
      const id = r.classlinkClassId;
      // An outage keeps a class ClassLink already confirmed for this roster.
      if (taught?.has(id) || (classLinkUnavailable && known[rosterId] === id))
        map[rosterId] = id;
    } else if (isClassId(r.testClassId) && testOrg) {
      const exists = (
        await db
          .doc(`organizations/${testOrg}/testClasses/${r.testClassId}`)
          .get()
      ).exists;
      if (exists) map[rosterId] = r.testClassId;
    }
  }
  return { map, classLinkUnavailable };
}

/** One write per path: a copy some Course still wants wins over a delete. */
function plan(
  before: Map<string, Data>[],
  after: Map<string, Data>[]
): Map<string, Data | null> {
  const writes = new Map<string, Data | null>();
  for (const m of before) for (const p of m.keys()) writes.set(p, null);
  for (const m of after) for (const [p, d] of m) writes.set(p, d);
  return writes;
}

function applyWrites(
  db: Firestore,
  tx: admin.firestore.Transaction,
  writes: Map<string, Data | null>
) {
  for (const [path, data] of writes) {
    if (data === null) tx.delete(db.doc(path));
    else tx.set(db.doc(path), data);
  }
}

const courseData = (c: Course): Data => {
  const rest: Partial<Course> = { ...c };
  delete rest.id;
  return rest;
};

async function loadCourses(
  tx: admin.firestore.Transaction,
  db: Firestore,
  uid: string
): Promise<Map<string, Course>> {
  const snap = await tx.get(
    db
      .collection(`users/${uid}/${COURSES_SUBCOLLECTION}`)
      .limit(COURSE_MAX_PER_TEACHER + 1)
  );
  const out = new Map<string, Course>();
  for (const d of snap.docs) {
    const c = readCourse(d.id, d.data());
    if (c) out.set(d.id, c);
  }
  return out;
}

function assertOneCoursePerClass(courses: Iterable<Course>) {
  const owner = new Map<string, string>();
  for (const c of courses) {
    for (const classId of classIdsOf(c)) {
      const other = owner.get(classId);
      if (other && other !== c.id)
        throw new HttpsError(
          'failed-precondition',
          'That class is already in another course.'
        );
      owner.set(classId, c.id);
    }
  }
}

async function save(
  db: Firestore,
  teacher: { uid: string; email: string; name: string },
  input: Record<string, unknown>,
  deps: CourseDeps
): Promise<SaveCourseReply> {
  const name = cleanCourseText(input.name, COURSE_MAX_NAME_LENGTH);
  if (!name) bad('A course needs a name.');
  const rawIds = Array.isArray(input.rosterIds) ? input.rosterIds : [];
  if (!rawIds.every(isCourseDocId)) bad('Unknown class.');
  const rosterIds = [...new Set(rawIds as string[])];
  if (rosterIds.length === 0) bad('A course needs at least one class.');
  if (rosterIds.length > COURSE_MAX_CLASSES) bad('Too many classes.');
  if (input.agenda != null && !cleanCourseAgenda(input.agenda))
    bad('That Agenda file is not valid.');
  const agenda = cleanCourseAgenda(input.agenda);
  const pinnedLinks = cleanPinnedLinks(input.pinnedLinks);
  const courseId = input.id === undefined ? null : input.id;
  if (courseId !== null && !isCourseDocId(courseId)) bad('Unknown course.');

  const rosterSnaps = await db.getAll(
    ...rosterIds.map((id) => db.doc(`users/${teacher.uid}/rosters/${id}`))
  );
  const rosters = new Map<string, Data>();
  rosterSnaps.forEach((s, i) => {
    if (!s.exists) throw new HttpsError('not-found', 'Unknown class.');
    rosters.set(rosterIds[i], s.data() ?? {});
  });
  const known =
    courseId !== null
      ? (readCourse(
          courseId as string,
          (
            await db.doc(coursePath(teacher.uid, courseId as string)).get()
          ).data()
        )?.rosterClassIds ?? {})
      : {};
  const confirmed = await confirmClasses(db, teacher, rosters, known, deps);
  const now = deps.now();

  const savedId = await db.runTransaction(async (tx) => {
    const courses = await loadCourses(tx, db, teacher.uid);
    const prev = courseId !== null ? courses.get(courseId as string) : null;
    if (courseId !== null && !prev)
      throw new HttpsError('not-found', 'That course is gone.');
    if (!prev && courses.size >= COURSE_MAX_PER_TEACHER)
      throw new HttpsError('resource-exhausted', 'Too many courses.');
    const id = prev?.id ?? deps.newId();
    const famOn = input.familyLinkOn === true;
    const next: Course = {
      id,
      name,
      rosterIds,
      agenda,
      pinnedLinks,
      familyLink: prev?.familyLink
        ? { shareId: prev.familyLink.shareId, on: famOn }
        : famOn
          ? { shareId: deps.newId(), on: true }
          : null,
      linkId: prev?.linkId || deps.newId(),
      rosterClassIds: confirmed.map,
      deckCheck:
        prev && prev.agenda?.fileId === agenda?.fileId ? prev.deckCheck : null,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };

    const before: Map<string, Data>[] = [];
    const after: Map<string, Data>[] = [];
    const finals = new Map<string, Course>();
    const courseWrites = new Map<string, Data | null>();
    for (const c of courses.values()) {
      if (c.id === id) continue;
      const kept = c.rosterIds.filter((r) => !rosterIds.includes(r));
      if (kept.length === c.rosterIds.length) {
        finals.set(c.id, c);
        continue;
      }
      // A roster moving into this Course leaves its old one; an emptied Course is deleted.
      before.push(copiesOf(teacher.uid, c, teacher.name, now));
      if (kept.length === 0) {
        courseWrites.set(coursePath(teacher.uid, c.id), null);
        continue;
      }
      const map: Record<string, string> = {};
      for (const r of kept)
        if (c.rosterClassIds[r]) map[r] = c.rosterClassIds[r];
      const moved: Course = {
        ...c,
        rosterIds: kept,
        rosterClassIds: map,
        updatedAt: now,
      };
      finals.set(c.id, moved);
      after.push(copiesOf(teacher.uid, moved, teacher.name, now));
      courseWrites.set(coursePath(teacher.uid, c.id), courseData(moved));
    }
    finals.set(id, next);
    assertOneCoursePerClass(finals.values());
    if (prev) before.push(copiesOf(teacher.uid, prev, teacher.name, now));
    after.push(copiesOf(teacher.uid, next, teacher.name, now));
    courseWrites.set(coursePath(teacher.uid, id), courseData(next));
    applyWrites(db, tx, new Map([...plan(before, after), ...courseWrites]));
    return id;
  });

  return {
    courseId: savedId,
    rostersWithoutClassPage: rosterIds.filter((r) => !confirmed.map[r]),
    classLinkUnavailable: confirmed.classLinkUnavailable,
  };
}

async function unlink(
  db: Firestore,
  teacher: { uid: string; email: string; name: string },
  courseId: unknown,
  rosterId: unknown,
  deps: CourseDeps
): Promise<SaveCourseReply> {
  if (!isCourseDocId(courseId) || !isCourseDocId(rosterId))
    bad('Unknown class.');
  const now = deps.now();
  const rosterSnap = await db
    .doc(`users/${teacher.uid}/rosters/${rosterId as string}`)
    .get();
  const rosterName = cleanCourseText(
    rosterSnap.get('name'),
    COURSE_MAX_NAME_LENGTH
  );
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(
      db.doc(coursePath(teacher.uid, courseId as string))
    );
    const c = readCourse(courseId as string, snap.data());
    if (!c) throw new HttpsError('not-found', 'That course is gone.');
    if (!c.rosterIds.includes(rosterId as string)) bad('Unknown class.');
    if (c.rosterIds.length < 2)
      throw new HttpsError('failed-precondition', 'That class is on its own.');
    const r = rosterId as string;
    const rest: Record<string, string> = { ...c.rosterClassIds };
    delete rest[r];
    const remaining: Course = {
      ...c,
      rosterIds: c.rosterIds.filter((x) => x !== r),
      rosterClassIds: rest,
      updatedAt: now,
    };
    // D5: the class keeps a copy of the Agenda and pinned links; the family link stays with the old Course.
    const alone: Course = {
      id: deps.newId(),
      name: rosterName || c.name,
      rosterIds: [r],
      agenda: c.agenda,
      pinnedLinks: c.pinnedLinks,
      familyLink: null,
      linkId: deps.newId(),
      rosterClassIds: c.rosterClassIds[r] ? { [r]: c.rosterClassIds[r] } : {},
      deckCheck: c.deckCheck,
      createdAt: now,
      updatedAt: now,
    };
    const writes = plan(
      [copiesOf(teacher.uid, c, teacher.name, now)],
      [
        copiesOf(teacher.uid, remaining, teacher.name, now),
        copiesOf(teacher.uid, alone, teacher.name, now),
      ]
    );
    writes.set(coursePath(teacher.uid, c.id), courseData(remaining));
    writes.set(coursePath(teacher.uid, alone.id), courseData(alone));
    applyWrites(db, tx, writes);
    return {
      courseId: alone.id,
      rostersWithoutClassPage: alone.rosterClassIds[r] ? [] : [r],
      classLinkUnavailable: false,
    };
  });
}

async function remove(
  db: Firestore,
  teacher: { uid: string; name: string },
  courseId: unknown,
  deps: CourseDeps
): Promise<SaveCourseReply> {
  if (!isCourseDocId(courseId)) bad('Unknown course.');
  const now = deps.now();
  await db.runTransaction(async (tx) => {
    const path = coursePath(teacher.uid, courseId as string);
    const c = readCourse(
      courseId as string,
      (await tx.get(db.doc(path))).data()
    );
    if (!c) return;
    const writes = plan([copiesOf(teacher.uid, c, teacher.name, now)], []);
    writes.set(path, null);
    applyWrites(db, tx, writes);
  });
  return {
    courseId: null,
    rostersWithoutClassPage: [],
    classLinkUnavailable: false,
  };
}

async function recordDeckCheck(
  db: Firestore,
  uid: string,
  req: Record<string, unknown>,
  deps: CourseDeps
): Promise<SaveCourseReply> {
  if (!isCourseDocId(req.courseId)) bad('Unknown course.');
  const modifiedAt = req.modifiedAt;
  if (
    modifiedAt !== null &&
    !(typeof modifiedAt === 'number' && Number.isFinite(modifiedAt))
  )
    bad('Bad check.');
  if (!COURSE_DECK_SHARING.includes(req.sharing as CourseDeckSharing))
    bad('Bad check.');
  const ref = db.doc(coursePath(uid, req.courseId as string));
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists)
      throw new HttpsError('not-found', 'That course is gone.');
    tx.update(ref, {
      deckCheck: {
        checkedAt: deps.now(),
        modifiedAt,
        sharing: req.sharing,
      },
    });
  });
  return {
    courseId: req.courseId as string,
    rostersWithoutClassPage: [],
    classLinkUnavailable: false,
  };
}

export async function handleSaveCourse(
  db: Firestore,
  caller: CourseCaller | null,
  data: unknown,
  deps: CourseDeps
): Promise<SaveCourseReply> {
  const req = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  > & { action?: SaveCourseRequest['action'] };
  // Delete never needs the flag, so a teacher can always take a Course down.
  const teacher = await requireTeacher(
    db,
    caller,
    deps,
    req.action !== 'delete'
  );
  switch (req.action) {
    case 'save': {
      const course = req.course;
      if (!course || typeof course !== 'object') return bad('Missing course.');
      return save(db, teacher, course as Record<string, unknown>, deps);
    }
    case 'unlink':
      return unlink(db, teacher, req.courseId, req.rosterId, deps);
    case 'delete':
      return remove(db, teacher, req.courseId, deps);
    case 'recordDeckCheck':
      return recordDeckCheck(db, teacher.uid, req, deps);
    default:
      return bad('Unknown action.');
  }
}
