// Rules coverage for mentoring programs (TEAMS_REDESIGN T29 to T33): tasks, workspaces, check-ins, submissions. Reads only; every client write is refused (plcSettingsV1 and plcTeamItemsV1 write them).
//
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.

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
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-mentoring';
const PLC_ID = 'ment-plc';
const PLC = `plcs/${PLC_ID}`;

const LEAD = 'lead';
const COLEAD = 'colead';
const MENTOR = 'mentor-a';
const MENTEE = 'mentee-a';
const MENTOR_B = 'mentor-b';
const MENTEE_B = 'mentee-b';
const MEMBER = 'plain-member';
const VIEWER = 'viewer';
const OUTSIDER = 'outsider';

const WS = `${MENTOR}_${MENTEE}`;
const WS_PATH = `${PLC}/workspaces/${WS}`;
const WS_B = `${MENTOR_B}_${MENTEE_B}`;
const TASK_PATH = `${PLC}/tasks/t1`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore();

const member = (uid: string, role: string, mentorRole?: string) => ({
  uid,
  email: `${uid}@example.com`,
  displayName: uid,
  role,
  joinedAt: 1,
  status: 'active',
  ...(mentorRole ? { mentorRole } : {}),
});

const task = (extra: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Observation reflection',
  instructions: 'Write one page.',
  dueDate: '2026-10-24',
  submitter: 'mentee',
  templateDoc: { title: 'Template', url: 'https://docs.google.com/d/x' },
  createdBy: LEAD,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const workspace = (mentor = MENTOR, mentee = MENTEE) => ({
  mentorUid: mentor,
  menteeUid: mentee,
  memberUids: [mentor, mentee],
  mentorName: mentor,
  menteeName: mentee,
  actionItems: [],
  docs: [],
  taskStatus: {},
  createdAt: 1,
  updatedAt: 1,
});

const checkin = (createdBy: string, extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  title: 'Check-in Oct 6',
  body: '## Check-in\n',
  createdBy,
  createdByName: createdBy,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const subPath = (by: string) => `${WS_PATH}/submissions/t1_${by}`;

const submission = (by: string, extra: Record<string, unknown> = {}) => ({
  id: `t1_${by}`,
  taskId: 't1',
  submittedBy: by,
  submittedByName: by,
  submittedAt: 2,
  docUrl: 'https://docs.google.com/d/copy',
  ...extra,
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
  const all = [
    LEAD,
    COLEAD,
    MENTOR,
    MENTEE,
    MENTOR_B,
    MENTEE_B,
    MEMBER,
    VIEWER,
  ];
  await seed(PLC, {
    name: 'New Teacher Mentoring',
    groupType: 'mentoring',
    leadUid: LEAD,
    memberUids: all,
    memberEmails: Object.fromEntries(all.map((u) => [u, `${u}@example.com`])),
    members: {
      [LEAD]: member(LEAD, 'lead'),
      [COLEAD]: member(COLEAD, 'coLead'),
      [MENTOR]: member(MENTOR, 'member', 'mentor'),
      [MENTEE]: member(MENTEE, 'member', 'mentee'),
      [MENTOR_B]: member(MENTOR_B, 'member', 'mentor'),
      [MENTEE_B]: member(MENTEE_B, 'member', 'mentee'),
      [MEMBER]: member(MEMBER, 'member'),
      [VIEWER]: member(VIEWER, 'viewer', 'mentee'),
    },
    createdAt: 1,
    updatedAt: 1,
  });
});

const seedProgram = async () => {
  await seed(TASK_PATH, task());
  await seed(WS_PATH, workspace());
  await seed(`${PLC}/workspaces/${WS_B}`, workspace(MENTOR_B, MENTEE_B));
};

const EVERYONE = [
  LEAD,
  COLEAD,
  MENTOR,
  MENTEE,
  MENTOR_B,
  MENTEE_B,
  MEMBER,
  VIEWER,
  OUTSIDER,
];

describe('mentor roles on member records', () => {
  it('refuses every client tagging a member as mentor or mentee (plcSettingsV1 does it)', async () => {
    for (const uid of EVERYONE) {
      await assertFails(
        updateDoc(doc(as(uid), PLC), {
          [`members.${MEMBER}.mentorRole`]: 'mentee',
          roleChangeUid: MEMBER,
          updatedAt: 2,
        })
      );
    }
    await assertFails(
      updateDoc(doc(as(LEAD), PLC), {
        [`members.${MEMBER}.mentorRole`]: deleteField(),
        roleChangeUid: MEMBER,
        updatedAt: 3,
      })
    );
  });
});

describe('tasks', () => {
  it('lets every member read, viewers included, and refuses outsiders', async () => {
    await seed(TASK_PATH, task());
    for (const uid of [LEAD, COLEAD, MENTOR, MENTEE, MEMBER, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), TASK_PATH)));
      await assertSucceeds(getDocs(collection(as(uid), `${PLC}/tasks`)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), TASK_PATH)));
  });

  it('refuses every client post (plcTeamItemsV1 writes tasks), facilitators included', async () => {
    for (const uid of EVERYONE) {
      await assertFails(
        setDoc(doc(as(uid), TASK_PATH), task({ createdBy: uid }))
      );
    }
    await assertFails(
      setDoc(
        doc(as(COLEAD), `${PLC}/tasks/t2`),
        task({ id: 't2', createdBy: COLEAD, templateDoc: null })
      )
    );
  });

  it('refuses every client edit and removal, facilitators included', async () => {
    await seed(TASK_PATH, task());
    for (const uid of EVERYONE) {
      await assertFails(
        updateDoc(doc(as(uid), TASK_PATH), { dueDate: '2026-10-31' })
      );
      await assertFails(deleteDoc(doc(as(uid), TASK_PATH)));
    }
  });
});

describe('workspaces', () => {
  it('lets facilitators and the pair read; nobody else', async () => {
    await seedProgram();
    for (const uid of [LEAD, COLEAD, MENTOR, MENTEE]) {
      await assertSucceeds(getDoc(doc(as(uid), WS_PATH)));
    }
    for (const uid of [MENTOR_B, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(getDoc(doc(as(uid), WS_PATH)));
    }
  });

  it('lets facilitators list every workspace and a pair list only its own', async () => {
    await seedProgram();
    await assertSucceeds(getDocs(collection(as(LEAD), `${PLC}/workspaces`)));
    await assertSucceeds(getDocs(collection(as(COLEAD), `${PLC}/workspaces`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(as(MENTEE), `${PLC}/workspaces`),
          where('memberUids', 'array-contains', MENTEE)
        )
      )
    );
    await assertFails(getDocs(collection(as(MENTEE), `${PLC}/workspaces`)));
    await assertFails(getDocs(collection(as(MEMBER), `${PLC}/workspaces`)));
  });

  it('keeps a pair member who became a viewer able to read', async () => {
    await seedProgram();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PLC), {
        [`members.${MENTEE}.role`]: 'viewer',
      });
    });
    await assertSucceeds(getDoc(doc(as(MENTEE), WS_PATH)));
  });

  it('refuses every client pairing, facilitators included (plcSettingsV1 does it)', async () => {
    for (const uid of EVERYONE) {
      await assertFails(setDoc(doc(as(uid), WS_PATH), workspace()));
    }
    await assertFails(
      setDoc(
        doc(as(COLEAD), `${PLC}/workspaces/${WS_B}`),
        workspace(MENTOR_B, MENTEE_B)
      )
    );
  });

  it('refuses every client edit and removal, the pair and facilitators included', async () => {
    await seedProgram();
    for (const uid of EVERYONE) {
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), {
          docs: [{ id: 'd', title: 'Goals', url: 'https://docs.google.com/d' }],
          updatedAt: 2,
        })
      );
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), { actionItems: [], updatedAt: 2 })
      );
      await assertFails(deleteDoc(doc(as(uid), WS_PATH)));
    }
  });
});

describe('check-ins', () => {
  const C_PATH = `${WS_PATH}/checkins/c1`;

  it('lets facilitators read; nobody outside the pair', async () => {
    await seedProgram();
    await seed(C_PATH, checkin(MENTEE));
    for (const uid of [LEAD, COLEAD]) {
      await assertSucceeds(getDoc(doc(as(uid), C_PATH)));
      await assertSucceeds(getDocs(collection(as(uid), `${WS_PATH}/checkins`)));
    }
    for (const uid of [MENTOR_B, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(getDoc(doc(as(uid), C_PATH)));
    }
  });

  it('lets the pair read', async () => {
    await seedProgram();
    await seed(C_PATH, checkin(MENTEE));
    for (const uid of [MENTOR, MENTEE]) {
      await assertSucceeds(getDoc(doc(as(uid), C_PATH)));
      await assertSucceeds(getDocs(collection(as(uid), `${WS_PATH}/checkins`)));
    }
  });

  it('refuses every client write, the pair included (plcSettingsV1 does it)', async () => {
    await seedProgram();
    for (const uid of EVERYONE) {
      await assertFails(setDoc(doc(as(uid), C_PATH), checkin(uid)));
    }
    await seed(C_PATH, checkin(MENTEE));
    for (const uid of EVERYONE) {
      await assertFails(updateDoc(doc(as(uid), C_PATH), { body: 'x' }));
      await assertFails(deleteDoc(doc(as(uid), C_PATH)));
    }
  });
});

describe('submissions', () => {
  const S_PATH = subPath(MENTEE);

  it('lets facilitators read; nobody outside the pair', async () => {
    await seedProgram();
    await seed(S_PATH, submission(MENTEE));
    for (const uid of [LEAD, COLEAD]) {
      await assertSucceeds(getDoc(doc(as(uid), S_PATH)));
    }
    for (const uid of [MENTOR_B, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(getDoc(doc(as(uid), S_PATH)));
    }
  });

  it('lets the pair read', async () => {
    await seedProgram();
    await seed(S_PATH, submission(MENTEE));
    for (const uid of [MENTOR, MENTEE]) {
      await assertSucceeds(getDoc(doc(as(uid), S_PATH)));
    }
  });

  it('refuses every client submit, the named submitter included (plcSettingsV1 does it)', async () => {
    await seedProgram();
    await seed(TASK_PATH, task({ submitter: 'both' }));
    for (const uid of EVERYONE) {
      await assertFails(setDoc(doc(as(uid), subPath(uid)), submission(uid)));
    }
    await assertFails(setDoc(doc(as(MENTEE), S_PATH), submission(MENTEE)));
  });

  it('refuses every client edit and delete of a submission', async () => {
    await seedProgram();
    await seed(S_PATH, submission(MENTEE));
    for (const uid of EVERYONE) {
      await assertFails(updateDoc(doc(as(uid), S_PATH), { submittedAt: 3 }));
      await assertFails(deleteDoc(doc(as(uid), S_PATH)));
    }
  });
});

describe('task status on the workspace', () => {
  const mark = (uid: string, at = 2) => ({
    [`t1_${uid}`]: { submittedAt: at, submittedBy: uid },
  });

  it('refuses marking a task with its submission, in a batch or on its own', async () => {
    await seedProgram();
    const fs = as(MENTEE);
    const batch = writeBatch(fs);
    batch.set(doc(fs, subPath(MENTEE)), submission(MENTEE));
    batch.update(doc(fs, WS_PATH), { taskStatus: mark(MENTEE), updatedAt: 2 });
    await assertFails(batch.commit());
    await seed(subPath(MENTEE), submission(MENTEE));
    for (const uid of [MENTOR, MENTEE]) {
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), {
          taskStatus: mark(MENTEE),
          updatedAt: 3,
        })
      );
    }
  });

  it('refuses a new pairing that arrives already marked', async () => {
    await assertFails(
      setDoc(doc(as(LEAD), WS_PATH), {
        ...workspace(),
        taskStatus: mark(MENTEE),
      })
    );
  });
});
