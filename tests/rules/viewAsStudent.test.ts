// Rules for super admin "View as student" (docs/plans/ADMIN_VIEW_AS.md D15).
// A preview token is signed in as the student with a read-only `viewAs` claim:
// it reads the student's own work and can never join, answer or post. PIN and
// SSO students without the claim keep their write paths. Run via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-view-as-student-rules';
const TEACHER_UID = 'teacher-uid-vas';
const SSO_UID = 'sso-student-uid';
const ANON_UID = 'anon-student-uid';
const CLASS_A = 'class-a';
const PIN_KEY = 'pin-period_1-01';
const WALL = `${TEACHER_UID}_wall`;
const LEGACY_WALL = `${TEACHER_UID}_legacy`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const FUTURE = () => Date.now() + 30 * 60 * 1000;
const PAST = () => Date.now() - 60 * 1000;

const previewClaim = (over: Record<string, unknown> = {}) => ({
  by: 'boss@orono.k12.mn.us',
  sid: 'sid-1',
  ro: true,
  adminTarget: false,
  exp: FUTURE(),
  student: true,
  ...over,
});

const ssoToken = (viewAs?: Record<string, unknown>): TokenOptions => ({
  studentRole: true,
  classIds: [CLASS_A],
  firebase: { sign_in_provider: 'custom' },
  ...(viewAs ? { viewAs } : {}),
});

const asSso = () =>
  testEnv.authenticatedContext(SSO_UID, ssoToken()).firestore();
const asSsoPreview = (over: Record<string, unknown> = {}) =>
  testEnv
    .authenticatedContext(SSO_UID, ssoToken(previewClaim(over)))
    .firestore();
const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asAnonPreview = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      studentRole: false,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
      viewAs: previewClaim(),
    })
    .firestore();

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
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const ssoResponse = (uid: string) => ({
  studentUid: uid,
  joinedAt: 1000,
  score: null,
  completedAt: null,
  answers: [],
  status: 'joined',
  completedAttempts: 0,
});
const pinResponse = (uid: string) => ({
  ...ssoResponse(uid),
  pin: '01',
  classPeriod: 'period_1',
});
const glResponse = (uid: string, sessionId: string) => ({
  sessionId,
  studentAnonymousId: uid,
  answers: [],
  startedAt: 1000,
  completedAt: null,
  score: null,
});
const glProgress = () => ({
  mode: 'try',
  modeSwitches: 0,
  furthestStepIdx: 1,
  completed: false,
  steps: {},
  startedAt: serverTimestamp(),
});
const post = (id: string, authorUid?: string) => ({
  id,
  content: 'hello',
  submittedAt: 1000,
  status: 'approved',
  ...(authorUid ? { authorUid } : {}),
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const session = {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      classIds: [CLASS_A],
    };
    for (const coll of ['quiz_sessions', 'video_activity_sessions']) {
      await setDoc(doc(db, `${coll}/s1`), { ...session, code: 'VASTST' });
      await setDoc(doc(db, `${coll}/open`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        mode: 'submissions',
        code: 'VASPIN',
      });
      await setDoc(doc(db, `${coll}/view`), { ...session, mode: 'view-only' });
      await setDoc(
        doc(db, `${coll}/s1/responses/${SSO_UID}`),
        ssoResponse(SSO_UID)
      );
      await setDoc(
        doc(db, `${coll}/open/responses/${PIN_KEY}`),
        pinResponse(ANON_UID)
      );
    }
    await setDoc(doc(db, 'guided_learning_sessions/g1'), {
      teacherUid: TEACHER_UID,
      classIds: [CLASS_A],
    });
    await setDoc(doc(db, 'guided_learning_sessions/g2'), {
      teacherUid: TEACHER_UID,
      classIds: [CLASS_A],
    });
    await setDoc(doc(db, 'guided_learning_sessions/gview'), {
      teacherUid: TEACHER_UID,
      assignmentMode: 'view-only',
    });
    await setDoc(
      doc(db, `guided_learning_sessions/g1/responses/${SSO_UID}`),
      glResponse(SSO_UID, 'g1')
    );
    await setDoc(doc(db, `guided_learning_sessions/g1/progress/${SSO_UID}`), {
      ...glProgress(),
      startedAt: new Date(1000),
    });
    await setDoc(doc(db, `activity_wall_sessions/${WALL}`), {
      teacherUid: TEACHER_UID,
      layout: 'grid',
      classIds: [CLASS_A],
    });
    await setDoc(doc(db, `activity_wall_sessions/${LEGACY_WALL}`), {
      teacherUid: TEACHER_UID,
    });
    await setDoc(
      doc(db, `activity_wall_sessions/${WALL}/submissions/${SSO_UID}__0`),
      post(`${SSO_UID}__0`, SSO_UID)
    );
    await setDoc(doc(db, `sessions/${TEACHER_UID}`), { code: 'LIVE' });
  });
});

describe.each(['quiz_sessions', 'video_activity_sessions'])(
  '%s responses',
  (coll) => {
    it('lets the preview read the student response and the session', async () => {
      await assertSucceeds(getDoc(doc(asSsoPreview(), `${coll}/s1`)));
      await assertSucceeds(
        getDoc(doc(asSsoPreview(), `${coll}/s1/responses/${SSO_UID}`))
      );
      await assertSucceeds(
        getDoc(doc(asAnonPreview(), `${coll}/open/responses/${PIN_KEY}`))
      );
    });

    it('refuses preview reads once the claim expires', async () => {
      await assertFails(
        getDoc(
          doc(asSsoPreview({ exp: PAST() }), `${coll}/s1/responses/${SSO_UID}`)
        )
      );
    });

    it('never lets the preview join, answer or submit', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(
          doc(ctx.firestore(), `${coll}/s1/responses/${SSO_UID}`)
        );
      });
      await assertFails(
        setDoc(
          doc(asSsoPreview(), `${coll}/s1/responses/${SSO_UID}`),
          ssoResponse(SSO_UID)
        )
      );
      await assertFails(
        setDoc(
          doc(asAnonPreview(), `${coll}/open/responses/pin-period_1-02`),
          pinResponse(ANON_UID)
        )
      );
      await assertFails(
        updateDoc(doc(asAnonPreview(), `${coll}/open/responses/${PIN_KEY}`), {
          status: 'completed',
        })
      );
    });

    it('still lets SSO and K-2 PIN students join without the claim', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(
          doc(ctx.firestore(), `${coll}/s1/responses/${SSO_UID}`)
        );
      });
      await assertSucceeds(
        setDoc(
          doc(asSso(), `${coll}/s1/responses/${SSO_UID}`),
          ssoResponse(SSO_UID)
        )
      );
      await assertSucceeds(
        setDoc(
          doc(asAnon(), `${coll}/open/responses/pin-period_1-02`),
          pinResponse(ANON_UID)
        )
      );
      await assertSucceeds(
        updateDoc(doc(asAnon(), `${coll}/open/responses/${PIN_KEY}`), {
          status: 'joined',
        })
      );
    });

    it('records no view-only visit for the preview', async () => {
      await assertFails(
        addDoc(collection(asSsoPreview(), `${coll}/view/views`), {
          viewedAt: new Date(),
        })
      );
      await assertSucceeds(
        addDoc(collection(asAnon(), `${coll}/view/views`), {
          viewedAt: new Date(),
        })
      );
    });
  }
);

describe('guided_learning_sessions', () => {
  it('lets the preview read its response and progress', async () => {
    await assertSucceeds(
      getDoc(
        doc(asSsoPreview(), `guided_learning_sessions/g1/responses/${SSO_UID}`)
      )
    );
    await assertSucceeds(
      getDoc(
        doc(asSsoPreview(), `guided_learning_sessions/g1/progress/${SSO_UID}`)
      )
    );
  });

  it('never lets the preview start, answer, seat or track progress', async () => {
    const db = asSsoPreview();
    await assertFails(
      setDoc(
        doc(db, `guided_learning_sessions/g2/responses/${SSO_UID}`),
        glResponse(SSO_UID, 'g2')
      )
    );
    await assertFails(
      updateDoc(doc(db, `guided_learning_sessions/g1/responses/${SSO_UID}`), {
        completedAt: 2000,
      })
    );
    await assertFails(
      setDoc(
        doc(db, `guided_learning_sessions/g2/progress/${SSO_UID}`),
        glProgress()
      )
    );
    await assertFails(
      setDoc(doc(db, `guided_learning_sessions/g2/seats/${SSO_UID}`), {
        classId: CLASS_A,
      })
    );
    await assertFails(
      addDoc(collection(db, 'guided_learning_sessions/gview/views'), {
        viewedAt: new Date(),
      })
    );
  });

  it('still lets a student start without the claim', async () => {
    await assertSucceeds(
      setDoc(
        doc(asSso(), `guided_learning_sessions/g2/responses/${SSO_UID}`),
        glResponse(SSO_UID, 'g2')
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asSso(), `guided_learning_sessions/g2/progress/${SSO_UID}`),
        glProgress()
      )
    );
  });
});

describe('activity_wall_sessions submissions', () => {
  it("lets the preview read the student's own posts", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(
            asSsoPreview(),
            `activity_wall_sessions/${WALL}/submissions`
          ),
          where('authorUid', '==', SSO_UID)
        )
      )
    );
  });

  it('never lets the preview post, on a padlet or a legacy wall', async () => {
    await assertFails(
      setDoc(
        doc(
          asSsoPreview(),
          `activity_wall_sessions/${WALL}/submissions/${SSO_UID}__1`
        ),
        post(`${SSO_UID}__1`, SSO_UID)
      )
    );
    await assertFails(
      setDoc(
        doc(
          asSsoPreview(),
          `activity_wall_sessions/${LEGACY_WALL}/submissions/p1`
        ),
        post('p1')
      )
    );
  });

  it('still lets a student post without the claim', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asSso(),
          `activity_wall_sessions/${WALL}/submissions/${SSO_UID}__1`
        ),
        post(`${SSO_UID}__1`, SSO_UID)
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asAnon(), `activity_wall_sessions/${LEGACY_WALL}/submissions/p1`),
        post('p1')
      )
    );
  });
});

describe('live session roster', () => {
  const student = () => ({
    pin: '01',
    status: 'active',
    joinedAt: 1000,
    lastActive: 1000,
  });

  it('never adds the preview to the live roster', async () => {
    await assertFails(
      setDoc(
        doc(asAnonPreview(), `sessions/${TEACHER_UID}/students/${ANON_UID}`),
        student()
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asAnon(), `sessions/${TEACHER_UID}/students/${ANON_UID}`),
        student()
      )
    );
  });
});
