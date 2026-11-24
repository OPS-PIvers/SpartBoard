// Firestore rules for Writing sessions, responses, log chunks and frozen copies (WRITING_ASSIGNMENT.md PR B1).
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-writing-sessions';
const TEACHER = 'wr-teacher';
const OTHER_TEACHER = 'wr-other-teacher';
const STUDENT = 'wr-student';
const CLASSMATE = 'wr-classmate';
const PICKED = 'wr-picked';
const OUTSIDER = 'wr-outsider';
const CLASS_A = 'class-a';
const SID = 'ws-1';
const SESSION = `writing_assignment_sessions/${SID}`;
const RESP = `${SESSION}/responses/${STUDENT}`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = (uid: string, classIds: string[] = [CLASS_A]) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      orgId: 'orono',
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
};

const session = (o: Record<string, unknown> = {}) => ({
  id: SID,
  teacherUid: TEACHER,
  itemId: 'w1',
  title: 'Narrative',
  prompt: '<p>Write.</p>',
  grading: { mode: 'ungraded' },
  allowPaste: false,
  recordingNotice: true,
  studentCanViewRecord: false,
  spellCheck: true,
  classIds: [CLASS_A],
  classId: CLASS_A,
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  ...o,
});

const response = (o: Record<string, unknown> = {}) => ({
  studentUid: STUDENT,
  classId: CLASS_A,
  html: '',
  summary: { wordCount: 0, savedAt: 1 },
  status: 'draft',
  saveCount: 3,
  tabId: 'tab-a',
  logChunk: 0,
  startedAt: 1,
  draftCount: 0,
  updatedAt: 1,
  ...o,
});

/** A normal save from the holding tab; saveKey names the tab and the counter (D23). */
const save = (o: Record<string, unknown> = {}) => {
  const out: Record<string, unknown> = {
    html: '<p>more</p>',
    summary: { wordCount: 1, savedAt: 2 },
    saveCount: 4,
    ...o,
  };
  const tab = typeof o.tabId === 'string' ? o.tabId : 'tab-a';
  if (!('saveKey' in o)) out.saveKey = `${tab}:${Number(out.saveCount)}`;
  return out;
};

/** A log chunk write batched with the response save it rides on (D25). */
const logWrite = (
  db: ReturnType<typeof asStudent>,
  n: number,
  data: Record<string, unknown>,
  patch: Record<string, unknown> = {}
) => {
  const batch = writeBatch(db);
  batch.update(doc(db, RESP), save(patch));
  batch.set(doc(db, `${RESP}/log/${n}`), data);
  return batch.commit();
};

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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(ctx.firestore(), [
      `${TEACHER}@example.com`,
      `${OTHER_TEACHER}@example.com`,
    ])
  );
  await seed(SESSION, session());
  await seed(RESP, response());
  await seed(
    `${SESSION}/responses/${CLASSMATE}`,
    response({ studentUid: CLASSMATE })
  );
});

describe('writing_assignment_sessions', () => {
  it('the teacher, class students and picked students read it; others do not', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), SESSION)));
    await assertSucceeds(getDoc(doc(asStudent(STUDENT), SESSION)));
    await assertFails(getDoc(doc(asStudent(OUTSIDER, ['class-z']), SESSION)));
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER), SESSION)));
    await seed(`student_assignments/${PICKED}/items/${SID}`, {
      kind: 'writing',
      teacherUid: TEACHER,
    });
    await assertSucceeds(getDoc(doc(asStudent(PICKED, ['class-z']), SESSION)));
  });

  it('lists only the teacher own sessions and a student class sessions', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(TEACHER), 'writing_assignment_sessions'),
          where('teacherUid', '==', TEACHER)
        )
      )
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudent(STUDENT), 'writing_assignment_sessions'),
          where('classIds', 'array-contains-any', [CLASS_A])
        )
      )
    );
    await assertFails(
      getDocs(collection(asStudent(STUDENT), 'writing_assignment_sessions'))
    );
  });

  it('no client creates, edits or deletes a session; functions do', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(TEACHER), 'writing_assignment_sessions/ws-2'),
        session({ id: 'ws-2' })
      )
    );
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), SESSION), { status: 'ended' })
    );
    await assertFails(deleteDoc(doc(asTeacher(TEACHER), SESSION)));
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), SESSION), { allowPaste: true })
    );
  });
});

describe('responses: reads', () => {
  it('the teacher reads every response of their session', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), RESP)));
    await assertSucceeds(
      getDocs(collection(asTeacher(TEACHER), `${SESSION}/responses`))
    );
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER), RESP)));
  });

  it('a student reads only their own', async () => {
    await assertSucceeds(getDoc(doc(asStudent(STUDENT), RESP)));
    await assertFails(
      getDoc(doc(asStudent(STUDENT), `${SESSION}/responses/${CLASSMATE}`))
    );
    await assertFails(
      getDocs(collection(asStudent(STUDENT), `${SESSION}/responses`))
    );
  });
});

describe('responses: student writes', () => {
  it('saves draft text and summary from the holding tab with a higher counter', async () => {
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
  });

  it('refuses draft text too long to freeze', async () => {
    await assertFails(
      updateDoc(
        doc(asStudent(STUDENT), RESP),
        save({ html: 'x'.repeat(130_001) })
      )
    );
  });

  it('cannot create a response; openWritingV1 does', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(OUTSIDER), `${SESSION}/responses/${OUTSIDER}`),
        response({ studentUid: OUTSIDER })
      )
    );
  });

  it('cannot change status or any teacher or server field', async () => {
    for (const patch of [
      { status: 'turned-in' },
      { status: 'returned' },
      { draftCount: 5 },
      { grade: { pointsAwarded: 10 } },
      { returnedAt: 9 },
      { deadlineAt: 9e12 },
      { classId: 'class-z' },
    ]) {
      await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save(patch)));
    }
  });

  it('the summary takes only the Writing record keys (D9)', async () => {
    const full = {
      wordCount: 3,
      savedAt: 2,
      writingMs: 1000,
      sessions: 1,
      pasteCount: 1,
      pastedChars: 12,
      untypedCount: 1,
      untypedChars: 4,
      awayMs: 500,
      awayCount: 2,
      logStoppedAt: 2,
    };
    await assertSucceeds(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ summary: full }))
    );
    // Speech to text: the dictated counts are optional numbers.
    await assertSucceeds(
      updateDoc(
        doc(asStudent(STUDENT), RESP),
        save({
          summary: { ...full, dictatedCount: 3, dictatedChars: 412 },
          saveCount: 8,
        })
      )
    );
    for (const extra of [
      { suspicious: true },
      { grade: 10 },
      { logPurgedAt: 1 },
    ]) {
      await assertFails(
        updateDoc(
          doc(asStudent(STUDENT), RESP),
          save({ summary: { ...full, ...extra }, saveCount: 9 })
        )
      );
    }
  });

  it('cannot write a locked response', async () => {
    for (const status of ['turned-in', 'returned']) {
      await seed(RESP, response({ status }));
      await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    }
    await seed(RESP, response({ status: 'revising' }));
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
  });

  it('refuses a stale counter (D23, D24)', async () => {
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ saveCount: 3 }))
    );
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ saveCount: 2 }))
    );
  });

  it('refuses another tab unless it claims the piece now (D23)', async () => {
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ tabId: 'tab-b' }))
    );
    await assertFails(
      updateDoc(
        doc(asStudent(STUDENT), RESP),
        save({ tabId: 'tab-b', tabAt: 5 })
      )
    );
    await assertSucceeds(
      updateDoc(
        doc(asStudent(STUDENT), RESP),
        save({ tabId: 'tab-b', tabAt: serverTimestamp() })
      )
    );
    // The old tab's next save is now stale.
    await assertFails(
      updateDoc(
        doc(asStudent(STUDENT), RESP),
        save({ tabId: 'tab-a', saveCount: 9 })
      )
    );
  });

  it('refuses a partial save that leaves out the tab (D23)', async () => {
    await seed(RESP, response({ tabId: 'tab-b' }));
    // The old tab omits tabId, so the stored tab-b stands; its key still names tab-a.
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), {
        html: '<p>old tab</p>',
        saveCount: 9,
        saveKey: 'tab-a:9',
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), {
        html: '<p>old tab</p>',
        saveCount: 9,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(STUDENT), RESP), {
        html: '<p>tab b</p>',
        saveCount: 9,
        saveKey: 'tab-b:9',
      })
    );
  });

  it('refuses html that is not a string', async () => {
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ html: ['x'] }))
    );
  });

  it('stops saving 30 seconds past the clock on timed work (D7)', async () => {
    await seed(RESP, response({ deadlineAt: Date.now() - 60_000 }));
    await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    await seed(RESP, response({ deadlineAt: Date.now() + 5_000 }));
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
  });

  it('saves only while a Manual class is started, or the student is let in', async () => {
    const pa = (state: string) => ({
      [CLASS_A]: { state, openAt: null, closeAt: null },
    });
    await seed(
      SESSION,
      session({ accessMode: 'assessment', periodAccess: pa('paused') })
    );
    await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    await seed(
      SESSION,
      session({
        accessMode: 'assessment',
        periodAccess: pa('paused'),
        studentAccess: { [STUDENT]: Date.now() + 60_000 },
      })
    );
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    await seed(
      SESSION,
      session({ accessMode: 'assessment', periodAccess: pa('open') })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ saveCount: 5 }))
    );
  });

  it('a classmate cannot write my response, nor can the teacher', async () => {
    await assertFails(updateDoc(doc(asStudent(CLASSMATE), RESP), save()));
    await assertFails(updateDoc(doc(asTeacher(TEACHER), RESP), save()));
  });

  it('stops saving once the session is ended or closed', async () => {
    await seed(SESSION, session({ status: 'ended', endedAt: 1 }));
    await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    await seed(SESSION, session({ closeAt: 1 }));
    await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save()));
  });

  it('keeps saving past the session close while the student pointer extends it', async () => {
    const later = Date.now() + 3_600_000;
    await seed(SESSION, session({ closeAt: 1 }));
    await seed(`student_assignments/${STUDENT}/items/${SID}`, {
      kind: 'writing',
      closeAt: later,
    });
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    // A pointer close that has passed keeps it closed.
    await seed(`student_assignments/${STUDENT}/items/${SID}`, {
      kind: 'writing',
      closeAt: 1,
    });
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ saveCount: 5 }))
    );
    await seed(`student_assignments/${STUDENT}/items/${SID}`, {
      kind: 'writing',
      closeAt: later,
    });
    await seed(SESSION, session({ status: 'ended', endedAt: 1, closeAt: 1 }));
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ saveCount: 5 }))
    );
  });

  it('opens the next log chunk up to the tenth', async () => {
    await assertSucceeds(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ logChunk: 1 }))
    );
    await seed(RESP, response({ logChunk: 9 }));
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ logChunk: 10 }))
    );
  });

  it('takes only whole-number counters and chunk numbers (security #6)', async () => {
    await seed(RESP, response({ logChunk: 0 }));
    for (const bad of [
      { logChunk: 0.5 },
      { logChunk: '1' },
      { saveCount: 4.5, saveKey: 'tab-a:4.5' },
    ])
      await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), save(bad)));
    await assertSucceeds(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ logChunk: 1 }))
    );
  });

  it('refuses a summary value that is not a number (security #6)', async () => {
    for (const bad of [
      { wordCount: '3', savedAt: 2 },
      { wordCount: 3, savedAt: { x: 1 } },
      { wordCount: 3, logStoppedAt: 'later' },
      { wordCount: 3, dictatedCount: '3' },
      { wordCount: 3, dictatedChars: true },
    ])
      await assertFails(
        updateDoc(doc(asStudent(STUDENT), RESP), save({ summary: bad }))
      );
  });

  it('never moves the log chunk back', async () => {
    await seed(RESP, response({ logChunk: 2 }));
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ logChunk: 1 }))
    );
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ logChunk: -1 }))
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ logChunk: 2 }))
    );
  });
});

describe('responses: Live view and Nudge (D15)', () => {
  const watch = { 'liveView.until': 9e12, 'liveView.notify': true };
  const nudge = { 'liveView.nudge': { at: 5, noteId: 'keep-going' } };

  it('the session teacher stamps, nudges and clears liveView; the student reads it', async () => {
    await assertSucceeds(updateDoc(doc(asTeacher(TEACHER), RESP), watch));
    await assertSucceeds(updateDoc(doc(asTeacher(TEACHER), RESP), nudge));
    const snap = await getDoc(doc(asStudent(STUDENT), RESP));
    expect(snap.data()?.liveView).toEqual({
      until: 9e12,
      notify: true,
      nudge: { at: 5, noteId: 'keep-going' },
    });
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER), RESP), {
        'liveView.until': deleteField(),
        'liveView.notify': deleteField(),
      })
    );
  });

  it('the teacher writes nothing but liveView, a map of at most three keys', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), RESP), { ...watch, wordCount: 3 })
    );
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), RESP), { status: 'returned' })
    );
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), RESP), { liveView: 'on' })
    );
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), RESP), {
        liveView: { until: 1, notify: false, nudge: { at: 1 }, pad: 'x' },
      })
    );
  });

  it('another teacher, the student and a classmate cannot write liveView', async () => {
    await assertFails(updateDoc(doc(asTeacher(OTHER_TEACHER), RESP), watch));
    await assertFails(updateDoc(doc(asStudent(STUDENT), RESP), nudge));
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), RESP), save({ liveView: null }))
    );
    await assertFails(updateDoc(doc(asStudent(CLASSMATE), RESP), watch));
  });

  it('a student save keeps the teacher liveView and a classmate never reads it', async () => {
    await seed(RESP, response({ liveView: { until: 9e12, notify: false } }));
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
    const snap = await getDoc(doc(asTeacher(TEACHER), RESP));
    expect(snap.data()?.liveView).toEqual({ until: 9e12, notify: false });
    await assertFails(getDoc(doc(asStudent(CLASSMATE), RESP)));
  });
});

describe('log chunks (D25)', () => {
  const chunk = (n: number) => `${RESP}/log/${n}`;

  it('the student writes the open chunk with a save; the teacher reads, students do not', async () => {
    await assertSucceeds(
      logWrite(asStudent(STUDENT), 0, { log: 'ab', closed: false })
    );
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), chunk(0))));
    await assertFails(getDoc(doc(asStudent(STUDENT), chunk(0))));
    await assertFails(
      setDoc(doc(asStudent(CLASSMATE), chunk(0)), { log: 'x', closed: false })
    );
  });

  it('the student reads their own chunks only when the teacher lets them (D11)', async () => {
    await seed(chunk(0), { log: 'ab', closed: false, updatedAt: 1 });
    await seed(`${SESSION}/responses/${CLASSMATE}/log/0`, {
      log: 'cd',
      closed: false,
      updatedAt: 1,
    });
    await assertFails(getDoc(doc(asStudent(STUDENT), chunk(0))));
    await seed(SESSION, session({ studentCanViewRecord: true }));
    await assertSucceeds(getDoc(doc(asStudent(STUDENT), chunk(0))));
    await assertSucceeds(
      getDocs(collection(asStudent(STUDENT), `${RESP}/log`))
    );
    await assertFails(
      getDoc(doc(asStudent(STUDENT), `${SESSION}/responses/${CLASSMATE}/log/0`))
    );
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER), chunk(0))));
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), chunk(0))));
    // Reading never lets the student write a chunk outside a save.
    await assertFails(
      setDoc(doc(asStudent(STUDENT), chunk(0)), { log: 'x', closed: false })
    );
  });

  it('no log writes once the yearly deletion stamped the piece (D21)', async () => {
    await seed(RESP, response({ logPurgedAt: 5 }));
    await assertFails(
      logWrite(asStudent(STUDENT), 0, { log: 'ab', closed: false })
    );
    await assertSucceeds(updateDoc(doc(asStudent(STUDENT), RESP), save()));
  });

  it('a chunk write alone, without a response save in its batch, is refused', async () => {
    await assertFails(
      setDoc(doc(asStudent(STUDENT), chunk(0)), { log: 'x', closed: false })
    );
  });

  it('a chunk write from a tab that lost the piece is refused with its save', async () => {
    await seed(RESP, response({ tabId: 'tab-b' }));
    await assertFails(
      logWrite(asStudent(STUDENT), 0, { log: 'stale', closed: false })
    );
    await assertSucceeds(
      logWrite(
        asStudent(STUDENT),
        0,
        { log: 'fresh', closed: false },
        { tabId: 'tab-b' }
      )
    );
  });

  it('checks the chunk shape and size', async () => {
    for (const bad of [
      { log: 'x', closed: 'no' },
      { log: 5, closed: false },
      { log: ['x'], closed: false },
      { log: 'x', closed: false, extra: 'y'.repeat(900_000) },
      { log: 'x', closed: false, other: 1 },
      { log: 'x'.repeat(200_001), closed: false },
    ])
      await assertFails(logWrite(asStudent(STUDENT), 0, bad));
    await assertSucceeds(
      logWrite(asStudent(STUDENT), 0, {
        log: 'x'.repeat(200_000),
        closed: false,
      })
    );
  });

  it('only the newest chunk is writable', async () => {
    await assertFails(
      logWrite(asStudent(STUDENT), 1, { log: 'x', closed: false })
    );
    await seed(RESP, response({ logChunk: 1 }));
    await seed(chunk(0), { log: 'old', closed: false });
    await assertFails(
      logWrite(asStudent(STUDENT), 0, { log: 'x', closed: false })
    );
  });

  it('closes the full chunk in the batch that opens the next', async () => {
    await assertSucceeds(
      logWrite(
        asStudent(STUDENT),
        0,
        { log: 'full', closed: true },
        { logChunk: 1 }
      )
    );
    await assertSucceeds(
      logWrite(
        asStudent(STUDENT),
        1,
        { log: 'next', closed: false },
        { logChunk: 1, saveCount: 5 }
      )
    );
  });

  it('a closed chunk never changes and is never deleted', async () => {
    await seed(chunk(0), { log: 'full', closed: true });
    await assertFails(
      logWrite(asStudent(STUDENT), 0, { log: 'y', closed: true })
    );
    await seed(chunk(0), { log: 'open', closed: false });
    await assertFails(deleteDoc(doc(asStudent(STUDENT), chunk(0))));
  });

  it('there is no eleventh chunk', async () => {
    await seed(RESP, response({ logChunk: 9 }));
    await assertSucceeds(
      logWrite(
        asStudent(STUDENT),
        9,
        { log: 'x', closed: true },
        { logChunk: 9 }
      )
    );
    await assertFails(
      logWrite(
        asStudent(STUDENT),
        10,
        { log: 'x', closed: false },
        { logChunk: 9, saveCount: 5 }
      )
    );
  });

  it('no log writes while the piece is locked or the session has ended', async () => {
    await seed(RESP, response({ status: 'turned-in' }));
    await assertFails(
      logWrite(asStudent(STUDENT), 0, { log: 'x', closed: false })
    );
    await seed(RESP, response());
    await seed(SESSION, session({ status: 'ended', endedAt: 1 }));
    await assertFails(
      logWrite(asStudent(STUDENT), 0, { log: 'x', closed: false })
    );
  });
});

describe('frozen copies', () => {
  const draft = `${RESP}/drafts/1`;

  it('the teacher reads them; the student only once returned', async () => {
    await seed(draft, { number: 1, html: 'x', turnedInAt: 1 });
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), draft)));
    await assertFails(getDoc(doc(asStudent(STUDENT), draft)));
    await seed(draft, { number: 1, html: 'x', turnedInAt: 1, returnedAt: 2 });
    await assertSucceeds(getDoc(doc(asStudent(STUDENT), draft)));
    await assertFails(getDoc(doc(asStudent(CLASSMATE), draft)));
  });

  it('the student lists their returned copies with one query', async () => {
    await seed(draft, { number: 1, html: 'x', turnedInAt: 1, returnedAt: 2 });
    await seed(`${RESP}/drafts/2`, { number: 2, html: 'y', turnedInAt: 3 });
    const returned = query(
      collection(asStudent(STUDENT), `${RESP}/drafts`),
      where('returnedAt', '>', 0)
    );
    const snap = await assertSucceeds(getDocs(returned));
    expect(snap.docs.map((d) => d.id)).toEqual(['1']);
    await assertFails(
      getDocs(
        query(
          collection(asStudent(CLASSMATE), `${RESP}/drafts`),
          where('returnedAt', '>', 0)
        )
      )
    );
  });

  it('before Return a student reads no grade: it sits on the copy, and the response has none', async () => {
    // As saveWritingFeedbackV1 leaves them: score on the copy, nothing on the response.
    await seed(draft, {
      number: 1,
      html: 'x',
      turnedInAt: 1,
      feedback: { pointsAwarded: 8 },
      grade: { draftId: '1', pointsAwarded: 8 },
    });
    await seed(RESP, response({ status: 'turned-in', latestDraftId: '1' }));
    const mine = await getDoc(doc(asStudent(STUDENT), RESP));
    expect(mine.data()?.grade).toBeUndefined();
    await assertFails(getDoc(doc(asStudent(STUDENT), draft)));
    await assertFails(
      getDocs(collection(asStudent(STUDENT), `${RESP}/drafts`))
    );
  });

  it('no client writes them, feedback included', async () => {
    await seed(draft, { number: 1, html: 'x', turnedInAt: 1 });
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), draft), {
        feedback: { pointsAwarded: 1 },
      })
    );
    await assertFails(
      setDoc(doc(asStudent(STUDENT), `${RESP}/drafts/2`), { html: 'x' })
    );
    await assertFails(deleteDoc(doc(asStudent(STUDENT), draft)));
  });
});

describe('teacher records', () => {
  const record = `users/${TEACHER}/writing_assignment_records/${SID}`;
  it('the owner reads; nobody writes or deletes from the client (deleteWritingSessionV1 does)', async () => {
    await seed(record, { id: SID, teacherUid: TEACHER });
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), record)));
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER), record)));
    await assertFails(
      setDoc(doc(asTeacher(TEACHER), record), { id: SID, title: 'x' })
    );
    await assertFails(deleteDoc(doc(asTeacher(TEACHER), record)));
  });
});

describe('peer review notes', () => {
  const NOTE = `${RESP}/peer/n1`;
  const note = (o: Record<string, unknown> = {}) => ({
    id: 'n1',
    by: CLASSMATE,
    kind: 'comment',
    start: 0,
    end: 3,
    quote: 'The',
    body: 'Nice',
    status: 'open',
    createdAt: 1,
    ...o,
  });
  beforeEach(async () => {
    await seed(NOTE, note());
  });

  it('the writer and the session teacher read notes; nobody else does', async () => {
    await assertSucceeds(getDoc(doc(asStudent(STUDENT), NOTE)));
    await assertSucceeds(
      getDocs(collection(asStudent(STUDENT), `${RESP}/peer`))
    );
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER), NOTE)));
    await assertFails(getDoc(doc(asStudent(CLASSMATE), NOTE)));
    await assertFails(getDoc(doc(asStudent(OUTSIDER), NOTE)));
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER), NOTE)));
  });

  it('no client creates or deletes a note; writingPeerReviewV1 does', async () => {
    await assertFails(
      setDoc(doc(asStudent(CLASSMATE), `${RESP}/peer/n2`), note({ id: 'n2' }))
    );
    await assertFails(
      setDoc(doc(asStudent(STUDENT), `${RESP}/peer/n2`), note({ id: 'n2' }))
    );
    await assertFails(deleteDoc(doc(asStudent(STUDENT), NOTE)));
    await assertFails(deleteDoc(doc(asStudent(CLASSMATE), NOTE)));
    await assertFails(deleteDoc(doc(asTeacher(TEACHER), NOTE)));
  });

  it('the writer closes an open note and changes nothing else', async () => {
    for (const status of ['accepted', 'rejected', 'resolved']) {
      await seed(NOTE, note());
      await assertSucceeds(
        updateDoc(doc(asStudent(STUDENT), NOTE), { status, resolvedAt: 5 })
      );
    }
    await seed(NOTE, note());
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), NOTE), {
        status: 'resolved',
        resolvedAt: 5,
        body: 'changed',
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), NOTE), {
        status: 'open',
        resolvedAt: 5,
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), NOTE), {
        status: 'resolved',
        resolvedAt: 'now',
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), NOTE), { by: STUDENT })
    );
  });

  it('a closed note never reopens, and the partner and teacher cannot close it', async () => {
    await assertFails(
      updateDoc(doc(asStudent(CLASSMATE), NOTE), {
        status: 'resolved',
        resolvedAt: 5,
      })
    );
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER), NOTE), {
        status: 'resolved',
        resolvedAt: 5,
      })
    );
    await seed(NOTE, note({ status: 'accepted', resolvedAt: 2 }));
    await assertFails(
      updateDoc(doc(asStudent(STUDENT), NOTE), {
        status: 'rejected',
        resolvedAt: 5,
      })
    );
  });

  it('peer links stay server-only', async () => {
    await seed(`${SESSION}/peer_links/${STUDENT}`, { reviews: CLASSMATE });
    await assertFails(
      getDoc(doc(asStudent(STUDENT), `${SESSION}/peer_links/${STUDENT}`))
    );
    await assertFails(
      setDoc(doc(asStudent(STUDENT), `${SESSION}/peer_links/${STUDENT}`), {
        reviews: OUTSIDER,
      })
    );
  });
});
