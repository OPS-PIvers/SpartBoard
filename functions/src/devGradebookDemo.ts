// Dev-only: seeds or removes a demo Gradebook (two test classes, twelve assignments, marks, targets) in the caller's dev account.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHmac } from 'crypto';
import './functionsInit';
import { STUDENT_PSEUDONYM_HMAC_SECRET } from './secrets';
import { normalizeEmailDomain, resolveOrgIdForDomain } from './classlinkShared';
import { DEV_PROJECT_ID, currentProjectId } from './devSyncFromProd';
import {
  ASSIGNMENTS,
  CLASSES,
  FR_ANSWERS,
  MARKS,
  PREFIX,
  TARGETS,
  demoEmail,
  tag,
  type DemoAssignment,
  type DemoClass,
  type DemoMark,
  type DemoTarget,
  type WorkState,
} from './devGradebookDemo/data';

type Firestore = admin.firestore.Firestore;
type DocRef = admin.firestore.DocumentReference;
type Doc = Record<string, unknown>;

const SETTINGS_ID = `${PREFIX}settings`;
const PERIOD_SET_ID = `${PREFIX}periods`;
const DAY = 86_400_000;
const COLLECTION: Record<DemoAssignment['kind'], string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
};

// ── Deterministic randomness, so a rerun rewrites the same data ──────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Rand = () => number;

function rng(key: string): Rand {
  let a = hashSeed(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// Central time, so due dates land at 11:59 pm for the teacher.
function endOfDay(now: number, offsetDays: number): number {
  const d = new Date(now + offsetDays * DAY - 5 * 3_600_000);
  d.setUTCHours(23, 59, 0, 0);
  return d.getTime() + 5 * 3_600_000;
}

const ymd = (ms: number): string =>
  new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);

/** Same formula as computeStudentUid(`test:${email}`) in classlinkShared.ts. */
export const demoStudentUid = (secret: string, email: string): string =>
  createHmac('sha256', secret)
    .update(`sid:test:${email.toLowerCase()}`)
    .digest('hex');

// ── Student behaviour model ──────────────────────────────────────────────

interface Profile {
  ability: number;
  growth: number;
  diligence: number;
  offsets: Record<string, number>;
}

function studentProfile(uid: string): Profile {
  const r = rng(`profile:${uid}`);
  const ability = 0.52 + r() * 0.44;
  const growth = (r() - 0.35) * 0.02;
  const diligence = r();
  const offsets: Record<string, number> = {};
  for (const t of TARGETS) offsets[t.code] = (r() - 0.5) * 0.24;
  return { ability, growth, diligence, offsets };
}

function pCorrect(p: Profile, target: string, index: number, r: Rand): number {
  return clamp(
    p.ability +
      (p.offsets[target] ?? 0) +
      p.growth * index +
      (r() - 0.5) * 0.18,
    0.08,
    0.98
  );
}

// ── Content builders ─────────────────────────────────────────────────────

interface KeyQuestion {
  id: string;
  type: 'MC' | 'free-response';
  text: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  points: number;
  targets: DemoTarget[];
  timestamp?: number;
}

function keyQuestions(a: DemoAssignment): KeyQuestion[] {
  const qs: KeyQuestion[] = (a.questions ?? []).map(
    ([text, correct, wrong, target], i) => ({
      id: `${a.key}-q${i + 1}`,
      type: 'MC',
      text,
      correctAnswer: correct,
      incorrectAnswers: wrong,
      points: a.points ?? 1,
      targets: [tag(target)],
      ...(a.kind === 'video-activity' ? { timestamp: 30 + i * 45 } : {}),
    })
  );
  if (a.freeResponse) {
    qs.push({
      id: `${a.key}-fr`,
      type: 'free-response',
      text: a.freeResponse.text,
      correctAnswer: '',
      incorrectAnswers: [],
      points: a.freeResponse.points,
      targets: [tag(a.freeResponse.target)],
    });
  }
  return qs;
}

function publicQuestions(keyQs: KeyQuestion[], r: Rand): Doc[] {
  return keyQs.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    points: q.points,
    choices:
      q.type === 'MC'
        ? [q.correctAnswer, ...q.incorrectAnswers].sort(() => r() - 0.5)
        : [],
    ...(q.timestamp !== undefined ? { timestamp: q.timestamp } : {}),
  }));
}

interface Answer {
  questionId: string;
  answer: string;
  answeredAt: number;
  isCorrect: boolean;
}

function answerQuestions(
  keyQs: KeyQuestion[],
  p: Profile,
  index: number,
  r: Rand,
  submittedAt: number,
  bonus = 0
): Answer[] {
  return keyQs
    .filter((q) => q.type === 'MC')
    .map((q, i) => {
      const right =
        r() < clamp(pCorrect(p, q.targets[0].code, index, r) + bonus, 0, 0.99);
      return {
        questionId: q.id,
        answer: right
          ? q.correctAnswer
          : q.incorrectAnswers[Math.floor(r() * q.incorrectAnswers.length)],
        answeredAt: submittedAt - (keyQs.length - i) * 45_000,
        isCorrect: right,
      };
    });
}

const withoutCorrectness = (answers: Answer[]): Doc[] =>
  answers.map(({ questionId, answer, answeredAt }) => ({
    questionId,
    answer,
    answeredAt,
  }));

// ── Plan: every doc the seed writes ──────────────────────────────────────

interface Student {
  uid: string;
  email: string;
}

interface PlannedSession {
  a: DemoAssignment;
  sid: string;
  index: number;
  dueAt: number;
  ref: DocRef;
  session: Doc;
  keyRef: DocRef | null;
  key: Doc | null;
  columnTargets: DemoTarget[];
  docs: { ref: DocRef; data: Doc }[];
  state: Record<string, WorkState>;
}

interface ClassPlan {
  cls: DemoClass;
  rosterId: string;
  students: Student[];
  sessions: PlannedSession[];
  retakes: { sid: string; uid: string; ref: DocRef; data: Doc }[];
}

function planClass(
  db: Firestore,
  cls: DemoClass,
  roster: { id: string; name: string },
  teacherUid: string,
  secret: string,
  now: number
): ClassPlan {
  const students = cls.names.map((n) => {
    const email = demoEmail(n);
    return { email, uid: demoStudentUid(secret, email) };
  });
  const sessions: PlannedSession[] = [];
  const retakes: ClassPlan['retakes'] = [];

  ASSIGNMENTS.forEach((a, index) => {
    const sid = `${cls.slug}-${a.key}`;
    const dueAt = endOfDay(now, a.due);
    const openAt = dueAt - 6 * DAY;
    const createdAt = openAt - 3_600_000;
    const past = dueAt < now;
    const publishedAt =
      a.unpublished || !past ? null : Math.min(now - 3_600_000, dueAt + DAY);
    const r = rng(`session:${sid}`);
    const base: Doc = {
      id: sid,
      teacherUid,
      rosterIds: [roster.id],
      classIds: [cls.slug],
      classId: cls.slug,
      periodNames: [roster.name],
      createdAt,
      openAt,
      dueAt,
      closeAt: null,
      mode: 'assignment',
      gbDemo: true,
      ...(publishedAt ? { scorePublishedAt: publishedAt } : {}),
    };
    const ref = db.collection(COLLECTION[a.kind]).doc(sid);
    const s: PlannedSession = {
      a,
      sid,
      index,
      dueAt,
      ref,
      session: base,
      keyRef: null,
      key: null,
      columnTargets: [],
      docs: [],
      state: {},
    };

    const keyQs = keyQuestions(a);
    let stepIds: string[] = [];
    if (a.kind === 'quiz') {
      s.session = {
        ...base,
        assignmentId: sid,
        quizId: `${PREFIX}${a.key}`,
        quizTitle: a.title,
        status: past ? 'ended' : 'active',
        sessionMode: 'student',
        widgetKind: 'quiz',
        currentQuestionIndex: 0,
        startedAt: openAt,
        endedAt: past ? dueAt : null,
        code: String(100000 + Math.floor(r() * 899999)),
        totalQuestions: keyQs.length,
        publicQuestions: publicQuestions(keyQs, r),
        attemptLimit: a.attemptLimit ?? 1,
      };
      s.keyRef = db.doc(
        `users/${teacherUid}/quiz_assignments/${sid}/key/answers`
      );
      s.key = { questions: keyQs, updatedAt: createdAt };
    } else if (a.kind === 'video-activity') {
      s.session = {
        ...base,
        activityId: `${PREFIX}${a.key}`,
        activityTitle: a.title,
        assignmentName: a.title,
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        questions: [],
        publicQuestions: publicQuestions(keyQs, r),
        status: past ? 'ended' : 'active',
        allowedPins: [],
      };
      s.keyRef = ref.collection('key').doc('answers');
      s.key = { questions: keyQs, updatedAt: createdAt };
    } else {
      stepIds = Array.from(
        { length: a.steps ?? 0 },
        (_, i) => `${a.key}-s${i + 1}`
      );
      s.session = {
        ...base,
        title: a.title,
        mode: 'guided',
        imageUrls: [],
        publicSteps: stepIds.map((id, i) => ({
          id,
          xPct: 20 + ((i * 13) % 60),
          yPct: 25 + ((i * 17) % 50),
          imageIndex: 0,
          interactionType: 'question',
          question: {
            type: 'multiple-choice',
            text: `Checkpoint ${i + 1}`,
            choices: ['A', 'B', 'C', 'D'],
          },
        })),
      };
      s.columnTargets = (a.columnTargets ?? []).map(tag);
    }

    students.forEach((st, si) => {
      const p = studentProfile(st.uid);
      const sr = rng(`work:${sid}:${st.uid}`);
      const roll = sr();
      s.state[st.uid] = 'none';
      const missingChance = 0.03 + (1 - p.diligence) * 0.1;
      if (past && roll < missingChance) return;
      if (!past && roll < 0.4) return;
      const inProgress = past && roll < missingChance + 0.025;
      const late = past && !inProgress && sr() < (1 - p.diligence) * 0.22;
      const submittedAt = late
        ? dueAt + Math.floor((1 + sr() * 2) * DAY)
        : Math.min(
            now - 600_000,
            dueAt - Math.floor(sr() * 4 * DAY) - 3_600_000
          );
      const docRef = ref.collection('responses').doc(st.uid);
      s.state[st.uid] = inProgress ? 'progress' : late ? 'late' : 'done';

      if (a.kind === 'guided-learning') {
        const answered = inProgress
          ? stepIds.slice(0, Math.ceil(stepIds.length / 2))
          : stepIds;
        const target = a.columnTargets?.[0] ?? '';
        s.docs.push({
          ref: docRef,
          data: {
            studentUid: st.uid,
            classId: cls.slug,
            startedAt: submittedAt - 20 * 60_000,
            answers: answered.map((stepId) => ({
              stepId,
              answer: 'A',
              isCorrect: sr() < pCorrect(p, target, index, sr),
              answeredAt: submittedAt,
            })),
            completedAt: inProgress ? null : submittedAt,
          },
        });
        return;
      }

      let answers = answerQuestions(keyQs, p, index, sr, submittedAt);
      if (inProgress) answers = answers.slice(0, Math.ceil(answers.length / 2));

      if (a.kind === 'video-activity') {
        s.docs.push({
          ref: docRef,
          data: {
            studentUid: st.uid,
            classId: cls.slug,
            joinedAt: submittedAt - 25 * 60_000,
            answers,
            completedAt: inProgress ? null : submittedAt,
          },
        });
        return;
      }

      const data: Doc = {
        studentUid: st.uid,
        classId: cls.slug,
        joinedAt: submittedAt - 30 * 60_000,
        status: inProgress ? 'in-progress' : 'completed',
        answers: withoutCorrectness(answers),
        submittedAt: inProgress ? null : submittedAt,
        completedAttempts: inProgress ? 0 : 1,
      };
      if (a.freeResponse && !inProgress) {
        (data.answers as Doc[]).push({
          questionId: `${a.key}-fr`,
          answer: FR_ANSWERS[Math.floor(sr() * FR_ANSWERS.length)],
          answeredAt: submittedAt - 30_000,
        });
        // A few students per class wait on grading, so the column shows ungraded work.
        if (si % 5 !== 2) {
          data.grading = {
            [`${a.key}-fr`]: {
              pointsAwarded: clamp(
                Math.round(p.ability * 5 + (sr() - 0.5) * 2),
                1,
                5
              ),
              gradedAt: Math.min(now - 1_800_000, submittedAt + DAY),
              gradedBy: teacherUid,
            },
          };
        }
      }
      s.docs.push({ ref: docRef, data });

      // Weaker first attempts on a retake-enabled quiz try again and do better.
      if ((a.attemptLimit ?? 1) > 1 && !inProgress) {
        const pct =
          answers.filter((x) => x.isCorrect).length /
          Math.max(1, answers.length);
        if (pct < 0.7 && sr() < 0.8) {
          const retakeAt = Math.min(now - 600_000, submittedAt + 2 * DAY);
          const retake = answerQuestions(keyQs, p, index, sr, retakeAt, 0.2);
          retakes.push({
            sid,
            uid: st.uid,
            ref: docRef,
            data: {
              ...data,
              answers: withoutCorrectness(retake).map((x) => ({
                ...x,
                takeIndex: 1,
              })),
              submittedAt: retakeAt,
              completedAttempts: 2,
            },
          });
        }
      }
    });
    sessions.push(s);
  });
  return { cls, rosterId: roster.id, students, sessions, retakes };
}

function pickStudent(
  p: ClassPlan,
  s: PlannedSession,
  m: DemoMark,
  taken: Set<string>
): Student | null {
  const n = p.students.length;
  for (const want of m.want) {
    for (let k = 0; k < n; k++) {
      const st = p.students[(m.s + k) % n];
      if (taken.has(`${s.sid}__${st.uid}`)) continue;
      if (s.state[st.uid] === want) return st;
    }
  }
  return null;
}

// ── Writes ───────────────────────────────────────────────────────────────

class Writer {
  private batch: admin.firestore.WriteBatch;
  private n = 0;
  total = 0;
  constructor(private readonly db: Firestore) {
    this.batch = db.batch();
  }
  async set(ref: DocRef, data: Doc): Promise<void> {
    this.batch.set(ref, data);
    await this.bump();
  }
  async delete(ref: DocRef): Promise<void> {
    this.batch.delete(ref);
    await this.bump();
  }
  private async bump(): Promise<void> {
    this.total++;
    if (++this.n >= 400) await this.flush();
  }
  async flush(): Promise<void> {
    if (this.n === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.n = 0;
  }
}

async function ensureFlagRow(db: Firestore, featureId: string): Promise<void> {
  const ref = db.doc(`global_permissions/${featureId}`);
  if ((await ref.get()).exists) return;
  await ref.set({
    featureId,
    accessLevel: 'admin',
    betaUsers: [],
    enabled: true,
    buildings: [],
  });
}

export interface DemoClassInfo {
  slug: string;
  title: string;
  students: { firstName: string; lastName: string; email: string }[];
}

/** Test classes and flag rows; returns what the client needs to import the classes as rosters. */
export async function prepareGradebookDemo(
  db: Firestore,
  orgId: string,
  teacherEmail: string,
  now: number
): Promise<DemoClassInfo[]> {
  const w = new Writer(db);
  for (const cls of CLASSES) {
    await w.set(db.doc(`organizations/${orgId}/testClasses/${cls.slug}`), {
      title: cls.title,
      subject: 'Science',
      memberEmails: cls.names.map(demoEmail),
      createdAt: now,
      createdBy: teacherEmail,
    });
  }
  await w.flush();
  await ensureFlagRow(db, 'gradebook');
  await ensureFlagRow(db, 'student-gradebook');
  return CLASSES.map((cls) => ({
    slug: cls.slug,
    title: cls.title,
    students: cls.names.map((n) => ({
      firstName: n[0],
      lastName: n[1],
      email: demoEmail(n),
    })),
  }));
}

export interface SeedResult {
  assignments: number;
  submissions: number;
  marks: number;
  rowsBuilt: number;
}

export async function seedGradebookDemo(
  db: Firestore,
  uid: string,
  orgId: string,
  secret: string,
  now: number,
  waitMs = { switchOn: 65_000, retakes: 120_000 }
): Promise<SeedResult> {
  const rosterSnap = await db.collection(`users/${uid}/rosters`).get();
  const rosters = CLASSES.map((cls) =>
    rosterSnap.docs.find((d) => d.get('testClassId') === cls.slug)
  );
  if (rosters.some((r) => !r)) {
    throw new HttpsError(
      'failed-precondition',
      'Import the demo classes first.'
    );
  }

  const switchRef = db.doc('admin_settings/gradebook_index');
  if ((await switchRef.get()).get('enabled') !== true) {
    await switchRef.set({ enabled: true }, { merge: true });
    // The index functions cache the switch for a minute.
    await sleep(waitMs.switchOn);
  }

  const ltRef = db.doc(`users/${uid}/userProfile/learningTargets`);
  const kept = ((await ltRef.get()).get('targets') ?? []) as Doc[];
  await ltRef.set(
    {
      targets: [
        ...kept.filter((t) => !String(t.id).startsWith(PREFIX)),
        ...TARGETS.map((t) => ({
          id: t.id,
          code: t.code,
          label: t.label,
          subject: 'science',
          grades: ['8'],
          createdAt: now,
          updatedAt: now,
        })),
      ],
      updatedAt: now,
    },
    { merge: true }
  );

  const w = new Writer(db);
  await w.set(db.doc(`users/${uid}/gradebook_settings/${SETTINGS_ID}`), {
    name: 'Science 8',
    flags: [
      {
        id: 'missing',
        name: 'Missing',
        key: 'M',
        color: 'rose',
        value: 0,
        visibility: 'students',
        builtIn: true,
      },
      {
        id: 'excused',
        name: 'Excused',
        key: 'X',
        color: 'slate',
        value: 'excluded',
        visibility: 'students',
        builtIn: true,
      },
      {
        id: 'late',
        name: 'Late',
        key: 'L',
        color: 'amber',
        value: null,
        visibility: 'teacher',
        builtIn: true,
      },
      {
        id: 'incomplete',
        name: 'Incomplete',
        key: 'I',
        color: 'orange',
        value: null,
        visibility: 'students',
        builtIn: false,
      },
      {
        id: 'absent',
        name: 'Absent',
        key: 'A',
        color: 'sky',
        value: null,
        visibility: 'teacher',
        builtIn: false,
      },
    ],
    categoriesEnabled: true,
    categories: [
      { id: 'achievement', name: 'Assessments', weight: 70 },
      { id: 'practice', name: 'Practice', weight: 30 },
    ],
    scale: { source: 'district' },
    method: 'decaying',
    studentVisibility: {
      scores: true,
      flags: true,
      comments: true,
      standards: true,
    },
    autoFlags: true,
    ownerUid: uid,
    editorUids: [],
    isDefault: false,
    updatedAt: now,
  });

  const secretKey = secret;
  const plans = CLASSES.map((cls, i) => {
    const r = rosters[i] as admin.firestore.QueryDocumentSnapshot;
    const name: unknown = r.get('name');
    return planClass(
      db,
      cls,
      { id: r.id, name: typeof name === 'string' ? name : cls.title },
      uid,
      secretKey,
      now
    );
  });

  for (const p of plans) {
    await w.set(db.doc(`users/${uid}/gradebook_classes/${p.rosterId}`), {
      rosterId: p.rosterId,
      ownerUid: uid,
      editorUids: [],
      configRef: { source: 'personal', configId: SETTINGS_ID },
      sort: null,
      nameFormat: 'last-first',
      cellFormat: 'percent',
      cardLayouts: {},
      updatedAt: now,
    });
    for (const s of p.sessions) {
      await w.set(s.ref, s.session);
      if (s.keyRef && s.key) await w.set(s.keyRef, s.key);
      await w.set(db.doc(`gradebook_columns/${s.sid}`), {
        kind: s.a.kind,
        sessionId: s.sid,
        ownerUid: uid,
        editorUids: [],
        category: s.a.category,
        countsTowardOverall: s.a.counts !== false,
        maxPointsOverride: null,
        attemptPolicy: s.a.attemptPolicy ?? 'latest',
        targets: s.columnTargets,
        hiddenInRosterIds: [],
        updatedAt: now,
      });
    }
  }
  await w.flush();
  // Sessions first so each response trigger finds its session.
  for (const p of plans)
    for (const s of p.sessions)
      for (const d of s.docs) await w.set(d.ref, d.data);
  await w.flush();

  let marks = 0;
  for (const p of plans) {
    const taken = new Set<string>();
    for (const m of MARKS[p.cls.slug] ?? []) {
      const s = p.sessions.find((x) => x.a.key === m.a);
      const st = s ? pickStudent(p, s, m, taken) : null;
      if (!s || !st) continue;
      const markId = `${s.sid}__${st.uid}`;
      taken.add(markId);
      marks++;
      const at = Math.min(now - 3_600_000, s.dueAt + DAY + m.s * 600_000);
      const mark = {
        kind: s.a.kind,
        sessionId: s.sid,
        studentUid: st.uid,
        ownerUid: uid,
        editorUids: [],
        rosterIds: [p.rosterId],
        override: m.override !== undefined ? { points: m.override, at } : null,
        comment: m.comment
          ? { text: m.comment[0], shared: m.comment[1], at }
          : null,
        flags: m.flags ?? [],
        suppressedAuto: m.suppressedAuto ?? [],
        publishOverride: m.publishOverride ?? null,
        updatedAt: at,
      };
      const markRef = db.doc(`gradebook_marks/${markId}`);
      await w.set(markRef, mark);
      const history = (field: string, after: unknown) =>
        w.set(markRef.collection('history').doc(`${PREFIX}${field}`), {
          ownerUid: uid,
          byUid: uid,
          at,
          field,
          before: field === 'flags' ? [] : null,
          after,
          batchId: null,
        });
      if (mark.override) await history('override', mark.override);
      if (mark.comment) await history('comment', mark.comment);
      if (mark.flags.length || mark.suppressedAuto.length)
        await history('flags', mark.flags);
      if (mark.publishOverride) await history('publish', mark.publishOverride);
    }
  }
  await w.flush();

  const periods = await db
    .collection('grading_period_sets')
    .where('orgId', '==', orgId)
    .limit(1)
    .get();
  const buildings: unknown = (await db.doc(`users/${uid}`).get()).get(
    'buildings'
  );
  if (periods.empty && Array.isArray(buildings) && buildings.length > 0) {
    const q1End = endOfDay(now, 40);
    await db.doc(`grading_period_sets/${PERIOD_SET_ID}`).set({
      name: 'Demo quarters',
      orgId,
      buildingIds: buildings,
      periods: [
        {
          id: 'q1',
          label: 'Quarter 1',
          start: ymd(endOfDay(now, -35)),
          end: ymd(q1End),
        },
        {
          id: 'q2',
          label: 'Quarter 2',
          start: ymd(q1End + DAY),
          end: ymd(q1End + 80 * DAY),
        },
      ],
      updatedAt: now,
    });
  }

  // Retakes land after the first attempt is on the row, so the row keeps both attempts.
  const retakes = plans.flatMap((p) => p.retakes);
  let pending = retakes;
  const deadline = Date.now() + waitMs.retakes;
  while (pending.length > 0 && Date.now() < deadline) {
    await sleep(5_000);
    const snaps = await db.getAll(
      ...pending.map((x) => db.doc(`grade_index/${x.sid}__${x.uid}`))
    );
    pending = pending.filter((_, i) => {
      const attempts: unknown = snaps[i].get('attempts');
      return !(Array.isArray(attempts) && attempts.length >= 1);
    });
  }
  for (const x of retakes) await w.set(x.ref, x.data);
  await w.flush();

  // Safety net: the scheduled recompute rebuilds every demo session.
  for (const p of plans)
    for (const s of p.sessions)
      await w.set(db.doc(`grade_index_sessions/${s.sid}`), {
        kind: s.a.kind,
        sessionId: s.sid,
        dirtyAt: now - 30 * DAY + s.index,
      });
  await w.flush();

  const sids = plans.flatMap((p) => p.sessions.map((s) => s.sid));
  let rowsBuilt = 0;
  for (let i = 0; i < sids.length; i += 30) {
    const snap = await db
      .collection('grade_index')
      .where('sessionId', 'in', sids.slice(i, i + 30))
      .get();
    rowsBuilt += snap.size;
  }
  return {
    assignments: sids.length,
    submissions: plans.reduce(
      (n, p) => n + p.sessions.reduce((m, s) => m + s.docs.length, 0),
      0
    ),
    marks,
    rowsBuilt,
  };
}

/** Deletes everything the seed wrote; returns the demo roster ids for the client to delete. */
export async function removeGradebookDemo(
  db: Firestore,
  uid: string,
  orgId: string,
  secret: string,
  sweepDelayMs = 20_000
): Promise<{ sessions: number; rosterIds: string[] }> {
  const w = new Writer(db);
  const studentUids = new Set<string>();
  for (const cls of CLASSES) {
    const ref = db.doc(`organizations/${orgId}/testClasses/${cls.slug}`);
    const emails: unknown = (await ref.get()).get('memberEmails');
    for (const e of Array.isArray(emails) ? emails : cls.names.map(demoEmail))
      if (typeof e === 'string') studentUids.add(demoStudentUid(secret, e));
    await w.delete(ref);
  }

  const sids: string[] = [];
  for (const [kind, coll] of Object.entries(COLLECTION)) {
    const snap = await db
      .collection(coll)
      .where('teacherUid', '==', uid)
      .where('gbDemo', '==', true)
      .get();
    for (const d of snap.docs) {
      if (!d.id.startsWith(PREFIX)) continue;
      sids.push(d.id);
      await db.recursiveDelete(d.ref);
      if (kind === 'quiz')
        await db.recursiveDelete(
          db.doc(`users/${uid}/quiz_assignments/${d.id}`)
        );
    }
  }
  const sweep = async (): Promise<void> => {
    for (let i = 0; i < sids.length; i += 30) {
      const snap = await db
        .collection('grade_index')
        .where('sessionId', 'in', sids.slice(i, i + 30))
        .get();
      for (const d of snap.docs) await w.delete(d.ref);
    }
    for (const suid of studentUids)
      for (const cls of CLASSES)
        await w.delete(db.doc(`student_grades/${suid}/classes/${cls.slug}`));
    await w.flush();
  };
  await sweep();

  const marks = await db
    .collection('gradebook_marks')
    .where('ownerUid', '==', uid)
    .get();
  for (const d of marks.docs)
    if (d.id.startsWith(PREFIX)) await db.recursiveDelete(d.ref);
  for (const sid of sids) {
    await w.delete(db.doc(`gradebook_columns/${sid}`));
    await w.delete(db.doc(`grade_index_sessions/${sid}`));
  }

  const rosterIds: string[] = [];
  const rosterSnap = await db.collection(`users/${uid}/rosters`).get();
  for (const d of rosterSnap.docs) {
    if (CLASSES.some((c) => c.slug === d.get('testClassId'))) {
      rosterIds.push(d.id);
      await w.delete(db.doc(`users/${uid}/gradebook_classes/${d.id}`));
    }
  }
  await w.delete(db.doc(`users/${uid}/gradebook_settings/${SETTINGS_ID}`));
  await w.delete(db.doc(`grading_period_sets/${PERIOD_SET_ID}`));
  await w.flush();

  const ltRef = db.doc(`users/${uid}/userProfile/learningTargets`);
  const targets: unknown = (await ltRef.get()).get('targets');
  if (Array.isArray(targets))
    await ltRef.set(
      {
        targets: (targets as Doc[]).filter(
          (t) => !String(t.id).startsWith(PREFIX)
        ),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

  // Delete triggers can rewrite a row or projection moments later; sweep once more.
  await sleep(sweepDelayMs);
  await sweep();
  return { sessions: sids.length, rosterIds };
}

type DemoRequest = { action?: unknown };

export const gradebookDemoV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 540,
    maxInstances: 2,
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
  },
  async (request) => {
    if (currentProjectId() !== DEV_PROJECT_ID) {
      throw new HttpsError(
        'failed-precondition',
        'This only runs in the dev project.'
      );
    }
    const email = request.auth?.token.email?.toLowerCase();
    if (!request.auth || !email || !request.auth.token.email_verified) {
      throw new HttpsError('unauthenticated', 'Sign in with Google first.');
    }
    const db = admin.firestore();
    if (!(await db.doc(`admins/${email}`).get()).exists) {
      throw new HttpsError('permission-denied', 'Admins only.');
    }
    const domain = normalizeEmailDomain(email);
    const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
    if (!orgId) {
      throw new HttpsError('failed-precondition', 'No organization found.');
    }
    const secret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!secret)
      throw new HttpsError('internal', 'Server configuration missing.');
    const action = (request.data as DemoRequest | null)?.action;
    const now = Date.now();
    if (action === 'prepare')
      return { classes: await prepareGradebookDemo(db, orgId, email, now) };
    if (action === 'seed')
      return seedGradebookDemo(db, request.auth.uid, orgId, secret, now);
    if (action === 'remove')
      return removeGradebookDemo(db, request.auth.uid, orgId, secret);
    throw new HttpsError('invalid-argument', 'Unknown action.');
  }
);
