// Activity Wall write boundaries: who may write a wall session, submission ids
// matching their doc ids, upload posts naming their own transit object, student
// self-edits leaving media and link previews as reviewed, narrowed synced admins,
// and uploaders' delete and re-upload rights on posted media.
//
// The Storage emulator does not resolve firestore.get()/exists() (see
// quizResponseMedia.test.ts), so the Storage cases pin denials only.
//
// Requires the Firestore and Storage emulators. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-security-batch-1b';
const TEACHER_UID = 'teacher-uid';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
const ACTIVITY_ID = 'activity-1';
const SESSION_ID = `${TEACHER_UID}_${ACTIVITY_ID}`;
const STUDENT_UID = 'student-uid';
const OTHER_STUDENT_UID = 'other-student-uid';
const SITE_ADMIN_EMAIL = 'site-admin@orono.k12.mn.us';
const SYNCED_SUPER_EMAIL = 'super@orono.k12.mn.us';
const NARROW_ADMIN_EMAIL = 'building-admin@orono.k12.mn.us';
const INACTIVE_EMAIL = 'gone@orono.k12.mn.us';

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

const staffToken = (email: string): TokenOptions => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
});
const studentToken: TokenOptions = {
  studentRole: true,
  classIds: ['class-1'],
  sso: true,
  firebase: { sign_in_provider: 'custom' },
};

const asTeacher = () =>
  testEnv.authenticatedContext(TEACHER_UID, staffToken(TEACHER_EMAIL));
const asStaff = (uid: string, email: string) =>
  testEnv.authenticatedContext(uid, staffToken(email));
const asStudent = (uid = STUDENT_UID) =>
  testEnv.authenticatedContext(uid, studentToken);
const asAnon = () =>
  testEnv.authenticatedContext('anon-uid', {
    firebase: { sign_in_provider: 'anonymous' },
  });

const session = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  activityId: ACTIVITY_ID,
  teacherUid: TEACHER_UID,
  title: 'Exit ticket',
  layout: 'wall',
  classIds: ['class-1'],
  allowedTypes: { photo: true, link: true, file: true, video: true },
  allowGuests: false,
  moderationEnabled: true,
  allowStudentEdit: true,
  allowStudentDelete: false,
  acceptingResponses: true,
  maxPostsPerStudent: 0,
  updatedAt: 1_000_000,
  ...overrides,
});

const subPath = (id: string) =>
  `activity_wall_sessions/${SESSION_ID}/submissions/${id}`;
const mediaPath = (subId: string, file = 'pic.jpg') =>
  `activity_wall_media/${SESSION_ID}/${subId}/${file}`;

const post = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  activityId: ACTIVITY_ID,
  type: 'text',
  content: 'My answer',
  authorUid: STUDENT_UID,
  isGuest: false,
  participantLabel: 'Sam',
  submittedAt: 1_700_000,
  status: 'pending',
  ...overrides,
});

const photoPost = (id: string, overrides: Record<string, unknown> = {}) =>
  post(id, {
    type: 'photo',
    content: mediaPath(id),
    storagePath: mediaPath(id),
    archiveStatus: 'firebase',
    fileName: 'pic.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1234,
    ...overrides,
  });

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
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
  await seed(`activity_wall_sessions/${SESSION_ID}`, session());
  await seed(`admins/${SITE_ADMIN_EMAIL}`, { email: SITE_ADMIN_EMAIL });
  await seed(`admins/${SYNCED_SUPER_EMAIL}`, {
    source: 'organizationMembersSync',
    orgId: 'orono',
    roleId: 'super_admin',
  });
  await seed(`admins/${NARROW_ADMIN_EMAIL}`, {
    source: 'organizationMembersSync',
    orgId: 'orono',
    roleId: 'building_admin',
  });
  await seed(`organizations/orono/members/${INACTIVE_EMAIL}`, {
    status: 'inactive',
    roleId: 'teacher',
  });
});

describe('wall session writes need a teacher identity', () => {
  it('a studentRole token cannot create a class-targeted wall under its own uid', async () => {
    await assertFails(
      setDoc(
        doc(asStudent().firestore(), `activity_wall_sessions/${STUDENT_UID}_x`),
        { id: `${STUDENT_UID}_x`, classIds: ['class-1'], layout: 'wall' }
      )
    );
  });

  it('a studentRole token cannot update a wall it made earlier', async () => {
    await seed(`activity_wall_sessions/${STUDENT_UID}_x`, {
      id: `${STUDENT_UID}_x`,
      layout: 'wall',
    });
    await assertFails(
      updateDoc(
        doc(asStudent().firestore(), `activity_wall_sessions/${STUDENT_UID}_x`),
        { classIds: ['class-1'] }
      )
    );
  });

  it('an anonymous caller cannot create a wall', async () => {
    await assertFails(
      setDoc(doc(asAnon().firestore(), 'activity_wall_sessions/anon-uid_x'), {
        id: 'anon-uid_x',
      })
    );
  });

  it('a deactivated staff account cannot create a wall', async () => {
    await assertFails(
      setDoc(
        doc(
          asStaff('gone-uid', INACTIVE_EMAIL).firestore(),
          'activity_wall_sessions/gone-uid_x'
        ),
        { id: 'gone-uid_x', teacherUid: 'gone-uid' }
      )
    );
  });

  it('the teacher still creates and updates their own wall', async () => {
    const db = asTeacher().firestore();
    await assertSucceeds(
      setDoc(doc(db, `activity_wall_sessions/${TEACHER_UID}_new`), {
        id: `${TEACHER_UID}_new`,
        teacherUid: TEACHER_UID,
        classIds: ['class-1'],
        layout: 'wall',
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, `activity_wall_sessions/${SESSION_ID}`), {
        acceptingResponses: false,
      })
    );
  });

  it('students still read the wall session', async () => {
    await assertSucceeds(
      getDoc(
        doc(asStudent().firestore(), `activity_wall_sessions/${SESSION_ID}`)
      )
    );
  });
});

describe('narrowed synced admins cannot publish or moderate another wall', () => {
  it('a synced building admin cannot publish another teacher wall', async () => {
    await assertFails(
      updateDoc(
        doc(
          asStaff('narrow-uid', NARROW_ADMIN_EMAIL).firestore(),
          `activity_wall_sessions/${SESSION_ID}`
        ),
        { publiclyShared: true }
      )
    );
  });

  it('a synced building admin cannot approve a pending post', async () => {
    await seed(subPath('sub-1'), post('sub-1'));
    await assertFails(
      updateDoc(
        doc(
          asStaff('narrow-uid', NARROW_ADMIN_EMAIL).firestore(),
          subPath('sub-1')
        ),
        { status: 'approved' }
      )
    );
  });

  it('a hand-made site admin and a synced super admin still can', async () => {
    await seed(subPath('sub-1'), post('sub-1'));
    await assertSucceeds(
      updateDoc(
        doc(
          asStaff('site-uid', SITE_ADMIN_EMAIL).firestore(),
          `activity_wall_sessions/${SESSION_ID}`
        ),
        { publiclyShared: true }
      )
    );
    await assertSucceeds(
      updateDoc(
        doc(
          asStaff('super-uid', SYNCED_SUPER_EMAIL).firestore(),
          subPath('sub-1')
        ),
        { status: 'approved' }
      )
    );
  });
});

describe('submission id matches its doc id', () => {
  it('a student create whose id names another post is denied', async () => {
    await assertFails(
      setDoc(
        doc(asStudent().firestore(), subPath(`${STUDENT_UID}__abc12345`)),
        post(`${OTHER_STUDENT_UID}__victim999`)
      )
    );
  });

  it('a teacher post whose id names another post is denied', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher().firestore(), subPath(`${TEACHER_UID}__abc12345`)),
        post('someone-else', {
          authorUid: TEACHER_UID,
          authorRole: 'teacher',
          status: 'approved',
        })
      )
    );
  });

  it('a matching id still posts, for students and the teacher', async () => {
    const id = `${STUDENT_UID}__abc12345`;
    await assertSucceeds(
      setDoc(doc(asStudent().firestore(), subPath(id)), post(id))
    );
    const tid = `${TEACHER_UID}__abc12345`;
    await assertSucceeds(
      setDoc(
        doc(asTeacher().firestore(), subPath(tid)),
        post(tid, {
          authorUid: TEACHER_UID,
          authorRole: 'teacher',
          status: 'approved',
        })
      )
    );
  });

  it('the teacher cannot change a post id on update, but still moderates', async () => {
    await seed(subPath('sub-1'), post('sub-1'));
    const db = asTeacher().firestore();
    await assertFails(updateDoc(doc(db, subPath('sub-1')), { id: 'sub-2' }));
    await assertSucceeds(
      updateDoc(doc(db, subPath('sub-1')), { status: 'approved' })
    );
  });
});

describe('upload posts point at their own transit object', () => {
  it.each(['photo', 'file', 'video'])(
    'a %s post with an outside URL as its media is denied',
    async (type) => {
      const id = `${STUDENT_UID}__abc12345`;
      await assertFails(
        setDoc(
          doc(asStudent().firestore(), subPath(id)),
          post(id, { type, content: 'https://evil.example/x.jpg' })
        )
      );
    }
  );

  it('an outside URL beside a valid storagePath is denied', async () => {
    const id = `${STUDENT_UID}__abc12345`;
    await assertFails(
      setDoc(
        doc(asStudent().firestore(), subPath(id)),
        photoPost(id, { content: 'https://evil.example/x.jpg' })
      )
    );
  });

  it('a teacher photo post with an outside URL is denied', async () => {
    const id = `${TEACHER_UID}__abc12345`;
    await assertFails(
      setDoc(
        doc(asTeacher().firestore(), subPath(id)),
        post(id, {
          type: 'photo',
          content: 'https://evil.example/x.jpg',
          authorUid: TEACHER_UID,
          authorRole: 'teacher',
          status: 'approved',
        })
      )
    );
  });

  it('a real upload post still goes through, and text and links are unaffected', async () => {
    const id = `${STUDENT_UID}__abc12345`;
    await assertSucceeds(
      setDoc(doc(asStudent().firestore(), subPath(id)), photoPost(id))
    );
    const lid = `${STUDENT_UID}__link1234`;
    await assertSucceeds(
      setDoc(
        doc(asStudent().firestore(), subPath(lid)),
        post(lid, {
          type: 'link',
          content: 'https://example.com',
          linkPreview: { domain: 'example.com', title: 'Example' },
        })
      )
    );
  });
});

describe('student self-edits leave media and previews as reviewed', () => {
  const id = `${STUDENT_UID}__abc12345`;

  it('an approved link post cannot swap its preview', async () => {
    await seed(
      subPath(id),
      post(id, {
        type: 'link',
        content: 'https://example.com',
        status: 'approved',
        linkPreview: { domain: 'example.com', title: 'Example' },
      })
    );
    await assertFails(
      updateDoc(doc(asStudent().firestore(), subPath(id)), {
        linkPreview: {
          domain: 'example.com',
          image: 'https://evil.example/x.png',
        },
        editedAt: 2,
      })
    );
  });

  it('an approved upload cannot swap its media fields or content', async () => {
    await seed(subPath(id), photoPost(id, { status: 'approved' }));
    const db = asStudent().firestore();
    await assertFails(
      updateDoc(doc(db, subPath(id)), {
        storagePath: mediaPath(id, 'other.jpg'),
        editedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(db, subPath(id)), { fileName: 'other.jpg', editedAt: 2 })
    );
    await assertFails(
      updateDoc(doc(db, subPath(id)), {
        content: 'https://evil.example/x.jpg',
        status: 'pending',
        editedAt: 2,
      })
    );
  });

  it('the shipped edit (title on an upload, text with re-review) still works', async () => {
    await seed(subPath(id), photoPost(id, { status: 'approved' }));
    const db = asStudent().firestore();
    await assertSucceeds(
      updateDoc(doc(db, subPath(id)), { title: 'New title', editedAt: 2 })
    );
    const tid = `${STUDENT_UID}__text1234`;
    await seed(subPath(tid), post(tid, { status: 'approved' }));
    await assertSucceeds(
      updateDoc(doc(db, subPath(tid)), {
        content: 'Edited',
        status: 'pending',
        editedAt: 2,
      })
    );
  });
});

// Delete and re-upload allows hinge on firestore.exists(), which this emulator doesn't resolve,
// so only path-ownership denials are observable here.
describe('uploaders cannot pull or swap media on a written post (Storage)', () => {
  const id = `${STUDENT_UID}__abc12345`;

  it('another student cannot delete the uploader media', async () => {
    await assertFails(
      deleteObject(ref(asStudent(OTHER_STUDENT_UID).storage(), mediaPath(id)))
    );
  });

  it('a student cannot add media under another student post', async () => {
    await assertFails(
      uploadBytes(
        ref(asStudent(OTHER_STUDENT_UID).storage(), mediaPath(id, 'swap.jpg')),
        new Uint8Array(8),
        { contentType: 'image/jpeg' }
      )
    );
  });
});

describe('padlet posts name their type', () => {
  it('a guest post with no type is denied on a padlet wall', async () => {
    await seed(
      `activity_wall_sessions/${SESSION_ID}`,
      session({ allowGuests: true, mode: 'photo' })
    );
    const { type: _omit, ...typeless } = post('anon-uid__abc12345', {
      authorUid: 'anon-uid',
      content: 'https://evil.example/x.png',
    });
    void _omit;
    await assertFails(
      setDoc(doc(asAnon().firestore(), subPath('anon-uid__abc12345')), typeless)
    );
  });

  it('a co-moderator or student cannot rewrite the content of a typeless post', async () => {
    const id = `${STUDENT_UID}__legacy12`;
    const { type: _omit, ...typeless } = post(id, { status: 'approved' });
    void _omit;
    await seed(subPath(id), typeless);
    await assertFails(
      updateDoc(doc(asStudent().firestore(), subPath(id)), {
        content: 'https://evil.example/x.png',
        status: 'pending',
        editedAt: 2,
      })
    );
  });
});

describe('untyped legacy posts', () => {
  const id = `${STUDENT_UID}__legacy34`;
  const legacyText = () => {
    const { type: _omit, ...rest } = post(id, { status: 'approved' });
    void _omit;
    return rest;
  };

  it('the author can still edit the text of an untyped text post', async () => {
    await seed(subPath(id), legacyText());
    await assertSucceeds(
      updateDoc(doc(asStudent().firestore(), subPath(id)), {
        content: 'Edited text',
        status: 'pending',
        editedAt: 2,
      })
    );
  });

  it('an untyped post holding a URL cannot be edited, and text cannot become a URL', async () => {
    await seed(subPath(id), {
      ...legacyText(),
      content: 'https://example.com/photo.jpg',
    });
    await assertFails(
      updateDoc(doc(asStudent().firestore(), subPath(id)), {
        content: 'https://evil.example/x.png',
        status: 'pending',
        editedAt: 2,
      })
    );
    const tid = `${STUDENT_UID}__legacy56`;
    const { type: _t, ...textOnly } = post(tid, { status: 'approved' });
    void _t;
    await seed(subPath(tid), textOnly);
    await assertFails(
      updateDoc(doc(asStudent().firestore(), subPath(tid)), {
        content: 'https://evil.example/x.png',
        status: 'pending',
        editedAt: 2,
      })
    );
  });

  it('a narrowed synced admin cannot delete or read another teacher post', async () => {
    await seed(subPath(id), legacyText());
    const db = asStaff('narrow-uid', NARROW_ADMIN_EMAIL).firestore();
    await assertFails(getDoc(doc(db, subPath(id))));
    await assertFails(deleteDoc(doc(db, subPath(id))));
    await assertSucceeds(
      getDoc(
        doc(asStaff('site-uid', SITE_ADMIN_EMAIL).firestore(), subPath(id))
      )
    );
  });
});
