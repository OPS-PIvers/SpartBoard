// Firestore security-rules tests for the `isSubMonitor` read branch
// (docs/plans/SUB_SHARE_COLLECTIONS.md §3.6, D7). Requires a running Firestore
// emulator; invoke via `pnpm run test:rules`.
//
// Contract: a substitute who launched a run from a sub share may read that one
// run's student work — and only until the share expires. Every other reader is
// unchanged: another named sub of the same share, the same sub after expiry,
// and any sub against a session the teacher started themselves are all denied.
//
// Reads, not writes: the sub monitors, and `controlSubAssignmentV1` carries
// pause and end, so no update rule was widened.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-sub-monitor-test';
const TEACHER_UID = 'teacher-uid-1';
const SUB_UID = 'sub-uid-1';
const OTHER_SUB_UID = 'sub-uid-2';
const STUDENT_UID = 'student-uid-1';

/** The run the sub launched, monitorable until the share expires. */
const LAUNCHED = 'session-sub-launched';
/** The same run, but the share has expired. */
const EXPIRED = 'session-share-expired';
/** A run the teacher started themselves — no monitor fields at all. */
const TEACHERS_OWN = 'session-teacher-own';

const PAST = 1_000_000_000_000; // 2001 — safely behind request.time
const FUTURE = 4_000_000_000_000; // 2096 — safely ahead of request.time

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asSub = (uid: string = SUB_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@orono.k12.mn.us',
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

/** The monitor stamp `launchSubAssignmentV1` writes, per session fixture. */
function monitorFields(sessionId: string): Record<string, unknown> {
  if (sessionId === LAUNCHED) {
    return {
      subMonitorUids: [SUB_UID],
      subMonitorUntil: FUTURE,
      launchedBy: {
        uid: SUB_UID,
        email: 'sub-uid-1@orono.k12.mn.us',
        shareId: 'share-1',
      },
    };
  }
  if (sessionId === EXPIRED) {
    return { subMonitorUids: [SUB_UID], subMonitorUntil: PAST };
  }
  return {};
}

const SESSIONS = [LAUNCHED, EXPIRED, TEACHERS_OWN];

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const id of SESSIONS) {
      const base = {
        id,
        teacherUid: TEACHER_UID,
        status: 'active',
        classIds: [],
        ...monitorFields(id),
      };

      await setDoc(doc(db, `quiz_sessions/${id}`), { ...base, quizId: 'q1' });
      await setDoc(doc(db, `quiz_sessions/${id}/responses/${STUDENT_UID}`), {
        studentUid: STUDENT_UID,
        score: 3,
      });

      await setDoc(doc(db, `video_activity_sessions/${id}`), {
        ...base,
        activityId: 'va1',
      });
      await setDoc(
        doc(db, `video_activity_sessions/${id}/responses/${STUDENT_UID}`),
        { studentUid: STUDENT_UID, score: 3 }
      );

      await setDoc(doc(db, `guided_learning_sessions/${id}`), {
        ...base,
        setId: 'gl1',
      });
      await setDoc(
        doc(db, `guided_learning_sessions/${id}/responses/${STUDENT_UID}`),
        { studentAnonymousId: STUDENT_UID, sessionId: id, score: 3 }
      );
      await setDoc(
        doc(db, `guided_learning_sessions/${id}/progress/${STUDENT_UID}`),
        { stepIndex: 2 }
      );

      await setDoc(doc(db, `flashcard_sessions/${id}`), {
        ...base,
        setId: 'fc1',
        kind: 'check',
        cards: [{ term: 'a', definition: 'b' }],
      });
      await setDoc(
        doc(db, `flashcard_sessions/${id}/progress/${STUDENT_UID}`),
        { classId: 'class-A', round: 1 }
      );
    }
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

/** Every read the sub's monitor makes, one per assignment kind. */
const READS: {
  kind: string;
  read: (db: ReturnType<typeof asSub>, sessionId: string) => Promise<unknown>;
}[] = [
  {
    kind: 'quiz responses',
    read: (db, id) =>
      getDoc(doc(db, `quiz_sessions/${id}/responses/${STUDENT_UID}`)),
  },
  {
    kind: 'video activity responses',
    read: (db, id) =>
      getDoc(doc(db, `video_activity_sessions/${id}/responses/${STUDENT_UID}`)),
  },
  {
    kind: 'guided learning responses',
    read: (db, id) =>
      getDoc(
        doc(db, `guided_learning_sessions/${id}/responses/${STUDENT_UID}`)
      ),
  },
  {
    kind: 'guided learning progress',
    read: (db, id) =>
      getDoc(doc(db, `guided_learning_sessions/${id}/progress/${STUDENT_UID}`)),
  },
  {
    kind: 'guided learning progress list',
    read: (db, id) =>
      getDocs(collection(db, `guided_learning_sessions/${id}/progress`)),
  },
  {
    kind: 'flashcard session',
    read: (db, id) => getDoc(doc(db, `flashcard_sessions/${id}`)),
  },
  {
    kind: 'flashcard progress',
    read: (db, id) =>
      getDoc(doc(db, `flashcard_sessions/${id}/progress/${STUDENT_UID}`)),
  },
  {
    kind: 'flashcard progress list',
    read: (db, id) =>
      getDocs(collection(db, `flashcard_sessions/${id}/progress`)),
  },
];

describe('admin_settings/sub_launch_as_teacher', () => {
  // The sub's board reads the switch to decide whether to offer Launch, so a
  // signed-in reader must get it; only an admin may flip it.
  it('is readable by a signed-in caller and writable only by an admin', async () => {
    const ref = (db: ReturnType<typeof asSub>) =>
      doc(db, 'admin_settings/sub_launch_as_teacher');
    await assertSucceeds(getDoc(ref(asSub())));
    await assertFails(setDoc(ref(asSub()), { enabled: true }));
  });
});

describe('isSubMonitor read branch', () => {
  for (const { kind, read } of READS) {
    describe(kind, () => {
      it('lets the sub who launched the run read it', async () => {
        await assertSucceeds(read(asSub(), LAUNCHED));
      });

      it('denies the same sub once the share has expired', async () => {
        await assertFails(read(asSub(), EXPIRED));
      });

      it('denies another sub named on the same share', async () => {
        await assertFails(read(asSub(OTHER_SUB_UID), LAUNCHED));
      });

      it('denies any sub on a run the teacher started themselves', async () => {
        await assertFails(read(asSub(), TEACHERS_OWN));
      });

      // The point of the branch is that it adds a reader, not that it replaces
      // one: the teacher still reads their own session's work.
      it('leaves the teacher’s own read working', async () => {
        await assertSucceeds(read(asTeacher(), TEACHERS_OWN));
      });
    });
  }
});
