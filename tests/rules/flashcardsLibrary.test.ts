// Firestore security-rules regression for Flashcards PR 1.
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
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-flashcards-library';
const OWNER_UID = 'flashcard-owner';
const OTHER_UID = 'flashcard-other';
const STUDENT_UID = 'flashcard-student';
const ADMIN_EMAIL = 'speak-admin@example.com';
const SPEAK_SETTINGS = {
  dialects: ['es-419', 'es-ES'],
  preset: 'beginner',
  strict: false,
  groups: { 'es-trill': 'forgive' },
  attempts: 3,
  example: true,
};
const cardSpeak = (term: string) => ({
  term,
  g2pVersion: 'test-1',
  status: 'ready',
  refs: ['es-419', 'es-ES'].map((dialect) => ({
    dialect,
    tokens: ['p', 'a', 'l', 'a', 'β', 'ɾ', 'a', 'x', 'x', 'x', 'x', 'x'],
    stress: [1],
  })),
});
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext('speak-admin', {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@example.com',
      studentRole: true,
      firebase: { sign_in_provider: 'google.com' },
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

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('teacher-owned flashcard collections', () => {
  it.each([
    'flashcard_sets/set-1',
    'flashcard_folders/folder-1',
    'flashcard_assignments/assignment-1',
  ])('allows the owner and denies another teacher for %s', async (suffix) => {
    const path = `users/${OWNER_UID}/${suffix}`;
    await assertSucceeds(setDoc(doc(asTeacher(OWNER_UID), path), { ok: true }));
    await assertSucceeds(getDoc(doc(asTeacher(OWNER_UID), path)));
    await assertFails(getDoc(doc(asTeacher(OTHER_UID), path)));
    await assertFails(setDoc(doc(asTeacher(OTHER_UID), path), { ok: true }));
  });

  it('denies a student-role user even under their own uid', async () => {
    const path = `users/${STUDENT_UID}/flashcard_sets/set-1`;
    await assertFails(setDoc(doc(asStudent(), path), { ok: true }));
    await assertFails(getDoc(doc(asStudent(), path)));
  });
});

describe('public flashcard snapshots', () => {
  const snapshot = {
    teacherUid: OWNER_UID,
    setId: 'set-1',
    title: 'Spanish basics',
    description: '',
    termLanguage: 'es-US',
    definitionLanguage: 'en-US',
    cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
    updatedAt: 1,
  };

  it('allows an unauthenticated get but denies collection listing', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(OWNER_UID), 'public_flashcard_sets/share-1'),
        snapshot
      )
    );
    const publicDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDoc(doc(publicDb, 'public_flashcard_sets/share-1'))
    );
    await assertFails(getDocs(collection(publicDb, 'public_flashcard_sets')));
  });

  it('limits mutation to the snapshot owner', async () => {
    const path = 'public_flashcard_sets/share-1';
    await assertSucceeds(setDoc(doc(asTeacher(OWNER_UID), path), snapshot));
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_UID), path), {
        title: 'Hijacked',
        teacherUid: OTHER_UID,
      })
    );
    await assertFails(deleteDoc(doc(asTeacher(OTHER_UID), path)));
    await assertSucceeds(deleteDoc(doc(asTeacher(OWNER_UID), path)));
  });

  it('rejects student publishers and unexpected fields', async () => {
    await assertFails(
      setDoc(doc(asStudent(), 'public_flashcard_sets/student-share'), {
        ...snapshot,
        teacherUid: STUDENT_UID,
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(OWNER_UID), 'public_flashcard_sets/bad-share'), {
        ...snapshot,
        secret: 'not allowed',
      })
    );
  });

  it('accepts a Speak stamp that anyone with the link can read, and rejects a malformed one', async () => {
    const path = 'public_flashcard_sets/share-speak';
    await assertSucceeds(
      setDoc(doc(asTeacher(OWNER_UID), path), {
        ...snapshot,
        speak: { ...SPEAK_SETTINGS, unclearConfidence: 0.35 },
        cards: [{ ...snapshot.cards[0], speak: cardSpeak('hola') }],
      })
    );
    const read = await getDoc(
      doc(testEnv.unauthenticatedContext().firestore(), path)
    );
    expect(read.get('speak.unclearConfidence')).toBe(0.35);
    await assertFails(
      setDoc(doc(asTeacher(OWNER_UID), path), { ...snapshot, speak: 'on' })
    );
  });
});

describe('Speak on the teacher-owned set', () => {
  it('saves a 500-card set with references for two dialects', async () => {
    const path = `users/${OWNER_UID}/flashcard_sets/set-big`;
    const cards = Array.from({ length: 500 }, (_, i) => ({
      id: `card-${i}`,
      term: `palabra${i}`,
      definition: `word ${i}`,
      speak: cardSpeak(`palabra${i}`),
    }));
    await assertSucceeds(
      setDoc(doc(asTeacher(OWNER_UID), path), {
        id: 'set-big',
        title: 'Big set',
        termLanguage: 'es-US',
        definitionLanguage: 'en-US',
        cards,
        speak: SPEAK_SETTINGS,
        createdAt: 1,
        updatedAt: 1,
      })
    );
    await assertSucceeds(getDoc(doc(asTeacher(OWNER_UID), path)));
  });
});

describe('admin_settings/flashcardsSpeak', () => {
  const path = 'admin_settings/flashcardsSpeak';
  const defaults = { languages: {}, attempts: 3, unclearConfidence: 0.4 };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), defaults);
      await setDoc(doc(context.firestore(), 'admin_settings/other'), {
        secret: true,
      });
      await setDoc(doc(context.firestore(), `admins/${ADMIN_EMAIL}`), {
        addedAt: 1,
      });
    });
  });

  it('lets any signed-in user read it, and nobody signed out', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(OTHER_UID), path)));
    await assertSucceeds(getDoc(doc(asStudent(), path)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), path))
    );
  });

  it('opens no other admin_settings doc', async () => {
    await assertFails(
      getDoc(doc(asTeacher(OTHER_UID), 'admin_settings/other'))
    );
  });

  it('lets only an admin write it', async () => {
    await assertFails(
      setDoc(doc(asTeacher(OTHER_UID), path), { ...defaults, attempts: 9 })
    );
    await assertFails(
      setDoc(doc(asStudent(), path), { ...defaults, attempts: 9 })
    );
    await assertSucceeds(
      setDoc(doc(asAdmin(), path), { ...defaults, attempts: 5 })
    );
  });
});

describe('admin_settings/flashcardsSpeakWordFixes', () => {
  const path = 'admin_settings/flashcardsSpeakWordFixes';
  const fix = {
    words: {
      'es:perro': {
        language: 'es',
        term: 'perro',
        skip: false,
        accepted: [
          {
            id: 'a1',
            kind: 'spelling',
            spelling: 'pero',
            refs: [
              { dialect: 'es-419', tokens: ['p', 'e', 'ɾ', 'o'], stress: [0] },
            ],
            addedAt: 1,
          },
        ],
        updatedAt: 1,
      },
    },
    updatedAt: 1,
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), fix);
      await setDoc(doc(context.firestore(), `admins/${ADMIN_EMAIL}`), {
        addedAt: 1,
      });
    });
  });

  it('lets teachers and students read it, and nobody signed out', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(OTHER_UID), path)));
    await assertSucceeds(getDoc(doc(asStudent(), path)));
    // PIN students sign in anonymously.
    await assertSucceeds(
      getDoc(
        doc(
          testEnv
            .authenticatedContext('pin-student', {
              firebase: { sign_in_provider: 'anonymous' },
            })
            .firestore(),
          path
        )
      )
    );
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), path))
    );
  });

  it('lets only an admin write it', async () => {
    await assertFails(setDoc(doc(asTeacher(OTHER_UID), path), fix));
    await assertFails(setDoc(doc(asStudent(), path), fix));
    await assertSucceeds(
      setDoc(doc(asAdmin(), path), { ...fix, updatedAt: 2 })
    );
  });
});
