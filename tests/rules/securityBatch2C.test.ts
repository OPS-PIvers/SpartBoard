// Projects run and upload boundaries: run ids carry their teacher's uid, a new
// upload record holds only the fields the client writes, a closed run freezes
// group uploads, and only a run's real teacher or member can put files in its
// transit folder.
//
// The Storage emulator does not resolve firestore.get()/exists() (see
// quizResponseMedia.test.ts), so the Storage cases pin denials only.
//
// Requires the Firestore and Storage emulators. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';
import { ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-security-batch-2c';
const TEACHER_UID = 'pj-teacher';
const OTHER_TEACHER_UID = 'pj-other-teacher';
const MEMBER_UID = 'pj-member';
const CLASS_ID = 'class-1';
const RUN_ID = `${TEACHER_UID}_project-1`;
const GROUP_PATH = `project_runs/${RUN_ID}/groups/group-1`;
const UPLOAD_ID = 'upload-1';
const UPLOAD_PATH = `${GROUP_PATH}/uploads/${UPLOAD_ID}`;
const STORAGE_PATH = `project_uploads/${RUN_ID}/group-1/${UPLOAD_ID}/poster.pdf`;

const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const STORAGE_RULES = fileURLToPath(
  new URL('../../storage.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const hostPort = (envValue: string | undefined, fallbackPort: number) => {
  const [host, port] = envValue ? envValue.split(':') : [];
  return {
    host: host || '127.0.0.1',
    port: port ? Number(port) : fallbackPort,
  };
};

const teacherToken = (uid: string): TokenOptions => ({
  email: `${uid}@example.com`,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
});
const studentToken: TokenOptions = {
  email: `${MEMBER_UID}@example.com`,
  studentRole: true,
  classIds: [CLASS_ID],
  firebase: { sign_in_provider: 'google.com' },
};

const asTeacher = (uid = TEACHER_UID) =>
  testEnv.authenticatedContext(uid, teacherToken(uid));
const asMember = () => testEnv.authenticatedContext(MEMBER_UID, studentToken);
const asAnon = () =>
  testEnv.authenticatedContext('anon-uid', {
    firebase: { sign_in_provider: 'anonymous' },
  });

const run = (id: string, teacherUid: string) => ({
  id,
  projectId: 'project-1',
  teacherUid,
  title: 'Ecosystem poster',
  steps: [{ id: 'step-1', title: 'Research' }],
  classIds: [CLASS_ID],
  approvalStepIds: [],
  acceptingUpdates: true,
  updatedAt: 1,
});

const upload = (overrides: Record<string, unknown> = {}) => ({
  id: UPLOAD_ID,
  fileName: 'poster.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  uploadedByUid: MEMBER_UID,
  uploadedAt: 1,
  storagePath: STORAGE_PATH,
  archiveStatus: 'firebase',
  ...overrides,
});

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

const seedRun = async (acceptingUpdates = true) => {
  await seed(`project_runs/${RUN_ID}`, {
    ...run(RUN_ID, TEACHER_UID),
    acceptingUpdates,
  });
  await seed(GROUP_PATH, {
    id: 'group-1',
    name: 'Otters',
    classId: CLASS_ID,
    memberUids: [MEMBER_UID],
    stepStates: {},
    updatedAt: 1,
  });
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES, 'utf8'),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
    storage: {
      rules: readFileSync(STORAGE_RULES, 'utf8'),
      ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(
      ctx.firestore(),
      [TEACHER_UID, OTHER_TEACHER_UID].map((uid) => `${uid}@example.com`)
    )
  );
});

describe('a run id starts with its teacher uid', () => {
  it('lets a teacher start a run under their own uid and read it back', async () => {
    const db = asTeacher().firestore();
    await assertSucceeds(
      setDoc(doc(db, `project_runs/${RUN_ID}`), run(RUN_ID, TEACHER_UID))
    );
    await assertSucceeds(getDoc(doc(db, `project_runs/${RUN_ID}`)));
  });

  it("refuses a run filed under another teacher's uid", async () => {
    const id = `${OTHER_TEACHER_UID}_project-1`;
    await assertFails(
      setDoc(
        doc(asTeacher().firestore(), `project_runs/${id}`),
        run(id, TEACHER_UID)
      )
    );
  });

  it('refuses a run id with no project after the uid', async () => {
    const id = `${TEACHER_UID}_`;
    await assertFails(
      setDoc(
        doc(asTeacher().firestore(), `project_runs/${id}`),
        run(id, TEACHER_UID)
      )
    );
  });
});

describe('a new upload record holds only client fields', () => {
  it('lets a member add a file, with or without a step', async () => {
    await seedRun();
    const db = asMember().firestore();
    await assertSucceeds(
      setDoc(doc(db, UPLOAD_PATH), upload({ stepId: 'step-1' }))
    );
    await assertSucceeds(getDoc(doc(db, UPLOAD_PATH)));
  });

  for (const [field, value] of [
    ['driveFileId', 'someone-elses-file'],
    ['driveUrl', 'https://drive.google.com/file/d/x/view'],
    ['attemptCount', 0],
  ] as const) {
    it(`refuses a member create carrying ${field}`, async () => {
      await seedRun();
      await assertFails(
        setDoc(
          doc(asMember().firestore(), UPLOAD_PATH),
          upload({ [field]: value })
        )
      );
    });
  }

  it('refuses the teacher a create carrying driveFileId too', async () => {
    await seedRun();
    await assertFails(
      setDoc(
        doc(asTeacher().firestore(), UPLOAD_PATH),
        upload({ uploadedByUid: TEACHER_UID, driveFileId: 'x' })
      )
    );
  });
});

describe('a closed run freezes group uploads', () => {
  it('lets a member remove their file while the run is open', async () => {
    await seedRun(true);
    await seed(UPLOAD_PATH, upload());
    await assertSucceeds(deleteDoc(doc(asMember().firestore(), UPLOAD_PATH)));
  });

  it('refuses a member delete once the run is closed, but still lets them read it', async () => {
    await seedRun(false);
    await seed(UPLOAD_PATH, upload());
    const db = asMember().firestore();
    await assertSucceeds(getDoc(doc(db, UPLOAD_PATH)));
    await assertFails(deleteDoc(doc(db, UPLOAD_PATH)));
  });

  it('lets the run teacher delete after the run is closed', async () => {
    await seedRun(false);
    await seed(UPLOAD_PATH, upload());
    await assertSucceeds(deleteDoc(doc(asTeacher().firestore(), UPLOAD_PATH)));
  });

  it('refuses another teacher', async () => {
    await seedRun(true);
    await seed(UPLOAD_PATH, upload());
    await assertFails(
      deleteDoc(doc(asTeacher(OTHER_TEACHER_UID).firestore(), UPLOAD_PATH))
    );
  });

  it('storage.rules gates a member delete on the run accepting updates', () => {
    const source = readFileSync(STORAGE_RULES, 'utf8');
    const block = source.slice(
      source.indexOf('match /project_uploads/'),
      source.indexOf('match /web_tour_pictures/')
    );
    const del = block.slice(block.indexOf('allow delete'));
    expect(del).toContain('pjIsGroupMember() && pjRunAccepting()');
    expect(del).not.toContain('pjOwnsRun()');
  });
});

describe('only a real run teacher or member uploads to the transit folder', () => {
  const file = new Uint8Array([1, 2, 3]);
  const pdf = { contentType: 'application/pdf' };

  it('refuses an anonymous session uploading under its own uid', async () => {
    await assertFails(
      uploadBytes(
        ref(asAnon().storage(), 'project_uploads/anon-uid_x/g/u/a.png'),
        file,
        { contentType: 'image/png' }
      )
    );
  });

  it('refuses a student uploading under its own uid', async () => {
    await assertFails(
      uploadBytes(
        ref(asMember().storage(), `project_uploads/${MEMBER_UID}_x/g/u/a.pdf`),
        file,
        pdf
      )
    );
  });

  it('refuses a teacher whose run doc does not exist', async () => {
    await assertFails(
      uploadBytes(
        ref(
          asTeacher().storage(),
          `project_uploads/${TEACHER_UID}_none/g/u/a.pdf`
        ),
        file,
        pdf
      )
    );
  });
});
