// Rules for the Music widget's own-song list: users/{uid}/music_stations (owner
// teacher only, canonical YouTube URL and thumbnail, no extra fields).
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-music-my-songs-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_UID = 'teacher-uid-2';
const ADMIN_UID = 'admin-uid-1';
const ADMIN_EMAIL = 'admin@school.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const teacher = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () => teacher(TEACHER_UID, 'teacher@school.edu');
const asOther = () => teacher(OTHER_UID, 'other@school.edu');
const asAdmin = () => teacher(ADMIN_UID, ADMIN_EMAIL);
const asStudentRole = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const songsPath = `users/${TEACHER_UID}/music_stations`;
const songPath = `${songsPath}/s1`;
const valid = () => ({
  title: 'Lo-fi beats',
  channel: 'Lofi Girl',
  url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
  createdAt: 1,
});

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      role: 'admin',
    });
    await setDoc(doc(ctx.firestore(), songPath), valid());
  });
});

describe('music_stations — reads', () => {
  it('lets the owner read a song and list them in order', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), songPath)));
    await assertSucceeds(
      getDocs(
        query(collection(asTeacher(), songsPath), orderBy('createdAt', 'asc'))
      )
    );
  });

  it('denies other teachers, admins, student-role sessions and signed-out reads', async () => {
    await assertFails(getDoc(doc(asOther(), songPath)));
    await assertFails(getDocs(collection(asOther(), songsPath)));
    await assertFails(getDoc(doc(asAdmin(), songPath)));
    await assertFails(getDoc(doc(asStudentRole(), songPath)));
    await assertFails(getDoc(doc(asUnauth(), songPath)));
  });
});

describe('music_stations — writes', () => {
  it('lets the owner add, rename and delete a song', async () => {
    await assertSucceeds(setDoc(doc(asTeacher(), `${songsPath}/s2`), valid()));
    await assertSucceeds(
      setDoc(doc(asTeacher(), songPath), { ...valid(), title: 'Focus' })
    );
    await assertSucceeds(deleteDoc(doc(asTeacher(), songPath)));
  });

  it('denies another teacher, a student-role session and signed-out writes', async () => {
    await assertFails(setDoc(doc(asOther(), `${songsPath}/s2`), valid()));
    await assertFails(deleteDoc(doc(asOther(), songPath)));
    await assertFails(setDoc(doc(asStudentRole(), `${songsPath}/s2`), valid()));
    await assertFails(deleteDoc(doc(asStudentRole(), songPath)));
    await assertFails(setDoc(doc(asUnauth(), `${songsPath}/s2`), valid()));
  });

  it('denies URLs and thumbnails that are not the canonical YouTube forms', async () => {
    const bad = (patch: Record<string, unknown>) =>
      setDoc(doc(asTeacher(), `${songsPath}/s2`), { ...valid(), ...patch });
    await assertFails(bad({ url: 'https://evil.example/watch?v=jfKfPfyJRdk' }));
    await assertFails(
      bad({ url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk&x=1' })
    );
    await assertFails(bad({ url: 'javascript:alert(1)' }));
    await assertFails(bad({ thumbnail: 'https://evil.example/a.jpg' }));
    await assertFails(
      bad({
        thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg?x',
      })
    );
  });

  it('denies extra fields, missing fields, wrong types and oversized text', async () => {
    const bad = (data: Record<string, unknown>) =>
      setDoc(doc(asTeacher(), `${songsPath}/s2`), data);
    await assertFails(bad({ ...valid(), studentName: 'Ada' }));
    const { channel: _channel, ...noChannel } = valid();
    await assertFails(bad(noChannel));
    await assertFails(bad({ ...valid(), createdAt: '1' }));
    await assertFails(bad({ ...valid(), title: 'x'.repeat(201) }));
    await assertFails(bad({ ...valid(), channel: 'x'.repeat(201) }));
  });
});
