// Rules for group meeting recordings (docs/plans/shipped/PLC_MEETING_RECORDING.md):
//   - plcs/{plcId}/recordings/{id}: members read; the recorder writes live fields only.
//   - .../transcript/main: members read; server writes.
//   - Storage plc_meeting_audio/{plcId}/{id}/{part}/{segment}.webm: members read, recorder uploads.
//
// Requires the Firestore and Storage emulators. Invoke via `pnpm run test:rules`.

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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  getMetadata,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'spartboard-plc-recordings';
const PLC_ID = 'plc-rec';
const NOTE_ID = 'note-1';
const REC_ID = 'rec-1';
const REC_COL = `plcs/${PLC_ID}/recordings`;
const REC_PATH = `${REC_COL}/${REC_ID}`;
const TRANSCRIPT_PATH = `${REC_PATH}/transcript/main`;
const segPath = (part = 0, seg = 0, recId = REC_ID, plcId = PLC_ID) =>
  `plc_meeting_audio/${plcId}/${recId}/${part}/${seg}.webm`;
const PART_FILE = `plc_meeting_audio/${PLC_ID}/${REC_ID}/0.webm`;

const LEAD = 'lead-uid';
const EDITOR = 'editor-uid';
const VIEWER = 'viewer-uid';
const OUTSIDER = 'outsider-uid';

const DAY = 24 * 60 * 60 * 1000;

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

const ctx = (uid: string) =>
  testEnv.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    email_verified: true,
  });
const db = (uid: string) => ctx(uid).firestore();
const storage = (uid: string) => ctx(uid).storage();

const member = (uid: string, role: string) => ({
  uid,
  email: `${uid}@example.com`,
  displayName: uid,
  role,
  joinedAt: 1,
  status: 'active',
});

const newRecording = (
  recorderUid: string,
  extra: Record<string, unknown> = {}
) => ({
  noteId: NOTE_ID,
  recorderUid,
  status: 'recording',
  parts: [],
  durationMs: 0,
  lastHeartbeatAt: serverTimestamp(),
  createdAt: serverTimestamp(),
  ...extra,
});

const seededRecording = (extra: Record<string, unknown> = {}) => ({
  noteId: NOTE_ID,
  recorderUid: EDITOR,
  status: 'recording',
  parts: [{ segmentCount: 2, durationMs: 60000 }],
  durationMs: 60000,
  lastHeartbeatAt: 1000,
  audioExpiresAt: Date.now() + 30 * DAY,
  createdAt: 1000,
  ...extra,
});

const seed = async (extra: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), REC_PATH), seededRecording(extra));
  });
};

const bytes = (n = 64) => new Uint8Array(n);
const upload = (
  uid: string,
  path: string,
  contentType = 'audio/webm;codecs=opus',
  size = 64
) => uploadBytes(ref(storage(uid), path), bytes(size), { contentType });

beforeAll(async () => {
  const fs = hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
  const st = hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(FIRESTORE_RULES, 'utf8'), ...fs },
    storage: { rules: readFileSync(STORAGE_RULES, 'utf8'), ...st },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (c) => {
    const fdb = c.firestore();
    await setDoc(doc(fdb, `plcs/${PLC_ID}`), {
      name: 'Group',
      leadUid: LEAD,
      memberUids: [LEAD, EDITOR, VIEWER],
      members: {
        [LEAD]: member(LEAD, 'lead'),
        [EDITOR]: member(EDITOR, 'member'),
        [VIEWER]: member(VIEWER, 'viewer'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(fdb, `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
      id: NOTE_ID,
      title: 'Meeting',
      body: '',
      createdBy: LEAD,
      createdAt: 1,
      lastEditedBy: LEAD,
      lastEditedAt: 1,
    });
  });
});

describe('recordings: read', () => {
  it('lets every member get and list, viewers included', async () => {
    await seed();
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(db(uid), REC_PATH)));
      await assertSucceeds(getDocs(collection(db(uid), REC_COL)));
    }
  });

  it('denies outsiders and signed-out callers', async () => {
    await seed();
    await assertFails(getDoc(doc(db(OUTSIDER), REC_PATH)));
    await assertFails(getDocs(collection(db(OUTSIDER), REC_COL)));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, REC_PATH)));
  });
});

describe('recordings: create', () => {
  it('lets an editor start a recording as themselves', async () => {
    await assertSucceeds(
      setDoc(doc(db(EDITOR), REC_PATH), newRecording(EDITOR))
    );
    await assertSucceeds(
      setDoc(
        doc(db(LEAD), `${REC_COL}/rec-2`),
        newRecording(LEAD, { audioExpiresAt: Date.now() + 30 * DAY - 1000 })
      )
    );
  });

  it('denies viewers and outsiders', async () => {
    await assertFails(setDoc(doc(db(VIEWER), REC_PATH), newRecording(VIEWER)));
    await assertFails(
      setDoc(doc(db(OUTSIDER), REC_PATH), newRecording(OUTSIDER))
    );
  });

  it('denies recording on behalf of someone else', async () => {
    await assertFails(setDoc(doc(db(EDITOR), REC_PATH), newRecording(LEAD)));
  });

  it('requires status recording and an existing note', async () => {
    await assertFails(
      setDoc(
        doc(db(EDITOR), REC_PATH),
        newRecording(EDITOR, { status: 'ready' })
      )
    );
    await assertFails(
      setDoc(
        doc(db(EDITOR), REC_PATH),
        newRecording(EDITOR, { noteId: 'missing-note' })
      )
    );
  });

  it('refuses server-only fields and an expiry past 30 days', async () => {
    for (const extra of [
      { draft: { markdown: 'x' } },
      { recoveredFrom: 'rec-0' },
      { audioDeletedAt: 1 },
      { audioExpiresAt: Date.now() + 40 * DAY },
    ]) {
      await assertFails(
        setDoc(doc(db(EDITOR), REC_PATH), newRecording(EDITOR, extra))
      );
    }
  });

  it('refuses a missing heartbeat or an over-long duration', async () => {
    const { lastHeartbeatAt: _drop, ...noHeartbeat } = newRecording(EDITOR);
    await assertFails(setDoc(doc(db(EDITOR), REC_PATH), noHeartbeat));
    await assertFails(
      setDoc(
        doc(db(EDITOR), REC_PATH),
        newRecording(EDITOR, { durationMs: 4_000_000 })
      )
    );
  });
});

describe('recordings: update', () => {
  it('lets the recorder heartbeat, pause and resume', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(db(EDITOR), REC_PATH), {
        lastHeartbeatAt: serverTimestamp(),
        durationMs: 90000,
        parts: [{ segmentCount: 3, durationMs: 90000 }],
      })
    );
    await assertSucceeds(
      updateDoc(doc(db(EDITOR), REC_PATH), { status: 'paused' })
    );
    await assertSucceeds(
      updateDoc(doc(db(EDITOR), REC_PATH), { status: 'recording' })
    );
  });

  it('denies other members, the lead included', async () => {
    await seed();
    for (const uid of [LEAD, VIEWER, OUTSIDER]) {
      await assertFails(
        updateDoc(doc(db(uid), REC_PATH), { lastHeartbeatAt: 2000 })
      );
    }
  });

  it('denies the recorder any status the server owns', async () => {
    await seed();
    for (const status of ['finalizing', 'ready', 'queued', 'transcribed']) {
      await assertFails(updateDoc(doc(db(EDITOR), REC_PATH), { status }));
    }
  });

  it('locks the recorder out once the server has taken over', async () => {
    await seed({ status: 'finalizing' });
    await assertFails(
      updateDoc(doc(db(EDITOR), REC_PATH), { lastHeartbeatAt: 2000 })
    );
  });

  it('denies writing drafts, expiry or identity fields', async () => {
    await seed();
    for (const patch of [
      { draft: { markdown: 'x', actionItems: [] } },
      { draftResolvedAt: 1 },
      { audioExpiresAt: Date.now() + 365 * DAY },
      { recorderUid: LEAD },
      { noteId: 'other' },
    ]) {
      await assertFails(updateDoc(doc(db(EDITOR), REC_PATH), patch));
    }
  });

  it('denies a paused recording being edited by a demoted recorder', async () => {
    await seed({ status: 'paused' });
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), `plcs/${PLC_ID}`), {
        [`members.${EDITOR}.role`]: 'viewer',
      });
    });
    await assertFails(
      updateDoc(doc(db(EDITOR), REC_PATH), { status: 'recording' })
    );
  });
});

describe('recordings: delete', () => {
  it('denies every client, the recorder included', async () => {
    await seed();
    for (const uid of [EDITOR, LEAD]) {
      await assertFails(deleteDoc(doc(db(uid), REC_PATH)));
    }
  });
});

describe('transcript', () => {
  beforeEach(async () => {
    await seed({ status: 'transcribed' });
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), TRANSCRIPT_PATH), {
        segments: [{ speaker: 1, startMs: 0, text: 'Hello' }],
      });
    });
  });

  it('lets every member read it', async () => {
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(db(uid), TRANSCRIPT_PATH)));
    }
  });

  it('denies outsiders', async () => {
    await assertFails(getDoc(doc(db(OUTSIDER), TRANSCRIPT_PATH)));
  });

  it('denies every client write', async () => {
    await assertFails(
      setDoc(doc(db(EDITOR), TRANSCRIPT_PATH), { segments: [] })
    );
    await assertFails(
      updateDoc(doc(db(LEAD), TRANSCRIPT_PATH), { segments: [] })
    );
    await assertFails(deleteDoc(doc(db(EDITOR), TRANSCRIPT_PATH)));
  });
});

// The Storage emulator does not resolve firestore.get() (see viewAs.test.ts), so
// every allow path is unobservable here; these cases pin the denials.
describe('storage: meeting audio', () => {
  it('denies uploads by other members or outsiders', async () => {
    await seed();
    for (const uid of [LEAD, VIEWER, OUTSIDER]) {
      await assertFails(upload(uid, segPath(0, 0)));
    }
  });

  it('denies uploads before the recording doc exists', async () => {
    await assertFails(upload(EDITOR, segPath(0, 0)));
  });

  it('refuses the wrong type, size or file name', async () => {
    await seed();
    await assertFails(upload(EDITOR, segPath(0, 0), 'audio/mpeg'));
    await assertFails(upload(EDITOR, segPath(0, 0), 'video/webm'));
    await assertFails(
      upload(EDITOR, segPath(0, 0), 'audio/webm', 5 * 1024 * 1024 + 1)
    );
    await assertFails(upload(EDITOR, PART_FILE));
    await assertFails(
      upload(EDITOR, `plc_meeting_audio/${PLC_ID}/${REC_ID}/0/a.webm`)
    );
  });

  it('refuses every client delete or overwrite', async () => {
    await seed({ status: 'ready' });
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), segPath(0, 0)), bytes(), {
        contentType: 'audio/webm',
      });
    });
    for (const uid of [EDITOR, LEAD]) {
      await assertFails(deleteObject(ref(storage(uid), segPath(0, 0))));
      await assertFails(upload(uid, segPath(0, 0)));
    }
  });

  it('denies reads to outsiders and signed-out callers', async () => {
    await seed({ status: 'ready' });
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), PART_FILE), bytes(), {
        contentType: 'audio/webm',
      });
    });
    await assertFails(getMetadata(ref(storage(OUTSIDER), PART_FILE)));
    await assertFails(getBytes(ref(storage(OUTSIDER), PART_FILE)));
    await assertFails(
      getMetadata(ref(testEnv.unauthenticatedContext().storage(), PART_FILE))
    );
  });
});
