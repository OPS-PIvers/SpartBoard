// Rules coverage for mentoring programs (TEAMS_REDESIGN T29 to T33): tasks, workspaces, check-ins, submissions.
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

const submission = (by: string, extra: Record<string, unknown> = {}) => ({
  id: 't1',
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

describe('mentor roles on member records', () => {
  it('lets facilitators tag a member as mentor or mentee', async () => {
    for (const uid of [LEAD, COLEAD]) {
      await assertSucceeds(
        updateDoc(doc(as(uid), PLC), {
          [`members.${MEMBER}.mentorRole`]: 'mentee',
          roleChangeUid: MEMBER,
          updatedAt: 2,
        })
      );
      await assertSucceeds(
        updateDoc(doc(as(uid), PLC), {
          [`members.${MEMBER}.mentorRole`]: deleteField(),
          roleChangeUid: MEMBER,
          updatedAt: 3,
        })
      );
    }
  });

  it('refuses members, mentors and outsiders tagging anyone', async () => {
    for (const uid of [MEMBER, MENTOR, MENTEE, VIEWER, OUTSIDER]) {
      await assertFails(
        updateDoc(doc(as(uid), PLC), {
          [`members.${MEMBER}.mentorRole`]: 'mentor',
          roleChangeUid: MEMBER,
          updatedAt: 2,
        })
      );
    }
    await assertFails(
      updateDoc(doc(as(MENTEE), PLC), {
        [`members.${MENTEE}.mentorRole`]: 'mentor',
        roleChangeUid: MENTEE,
        updatedAt: 2,
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

  it('lets facilitators post, edit and remove tasks', async () => {
    await assertSucceeds(setDoc(doc(as(LEAD), TASK_PATH), task()));
    await assertSucceeds(
      updateDoc(doc(as(COLEAD), TASK_PATH), { dueDate: '2026-10-31' })
    );
    await assertSucceeds(
      setDoc(
        doc(as(COLEAD), `${PLC}/tasks/t2`),
        task({ id: 't2', createdBy: COLEAD, templateDoc: null })
      )
    );
    await assertSucceeds(deleteDoc(doc(as(COLEAD), TASK_PATH)));
  });

  it('refuses everyone else, and bad shapes', async () => {
    for (const uid of [MENTOR, MENTEE, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(
        setDoc(doc(as(uid), TASK_PATH), task({ createdBy: uid }))
      );
    }
    await assertFails(
      setDoc(doc(as(LEAD), TASK_PATH), task({ submitter: 'everyone' }))
    );
    await assertFails(
      setDoc(doc(as(LEAD), TASK_PATH), task({ dueDate: 'Oct 24' }))
    );
    await assertFails(
      setDoc(doc(as(LEAD), TASK_PATH), task({ createdBy: COLEAD }))
    );
    await assertFails(
      setDoc(
        doc(as(LEAD), TASK_PATH),
        task({ templateDoc: { title: 'x', url: 'javascript:alert(1)' } })
      )
    );
    await assertFails(setDoc(doc(as(LEAD), TASK_PATH), task({ extra: 1 })));
    await seed(TASK_PATH, task());
    for (const uid of [MENTOR, MENTEE, MEMBER, VIEWER]) {
      await assertFails(
        updateDoc(doc(as(uid), TASK_PATH), { title: 'Changed' })
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

  it('lets facilitators pair a tagged mentor and mentee', async () => {
    await assertSucceeds(setDoc(doc(as(LEAD), WS_PATH), workspace()));
    await assertSucceeds(
      setDoc(
        doc(as(COLEAD), `${PLC}/workspaces/${WS_B}`),
        workspace(MENTOR_B, MENTEE_B)
      )
    );
    await assertSucceeds(deleteDoc(doc(as(COLEAD), WS_PATH)));
  });

  it('refuses untagged, viewer, swapped or mismatched pairings', async () => {
    const bad: [string, string][] = [
      [MEMBER, MENTEE],
      [MENTOR, VIEWER],
      [MENTEE, MENTOR],
      [MENTOR, MENTOR],
    ];
    for (const [a, b] of bad) {
      await assertFails(
        setDoc(doc(as(LEAD), `${PLC}/workspaces/${a}_${b}`), workspace(a, b))
      );
    }
    await assertFails(
      setDoc(doc(as(LEAD), `${PLC}/workspaces/other-id`), workspace())
    );
    await assertFails(
      setDoc(doc(as(LEAD), WS_PATH), {
        ...workspace(),
        memberUids: [MENTOR, MENTEE, MEMBER],
      })
    );
  });

  it('refuses pairing in a team that is not a mentoring program', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PLC), { groupType: 'plc' });
    });
    await assertFails(setDoc(doc(as(LEAD), WS_PATH), workspace()));
  });

  it('refuses pairing by anyone but facilitators', async () => {
    for (const uid of [MENTOR, MENTEE, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(setDoc(doc(as(uid), WS_PATH), workspace()));
    }
    await seedProgram();
    for (const uid of [MENTOR, MENTEE, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(deleteDoc(doc(as(uid), WS_PATH)));
    }
  });

  it('lets the pair edit its content but not the pairing', async () => {
    await seedProgram();
    for (const uid of [MENTOR, MENTEE]) {
      await assertSucceeds(
        updateDoc(doc(as(uid), WS_PATH), {
          actionItems: [],
          docs: [{ id: 'd', title: 'Goals', url: 'https://docs.google.com/d' }],
          updatedAt: 2,
        })
      );
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), { menteeUid: MEMBER })
      );
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), {
          memberUids: [MENTOR, MENTEE, MEMBER],
        })
      );
      await assertFails(updateDoc(doc(as(uid), WS_PATH), { mentorName: 'x' }));
    }
  });

  it('refuses edits from another pair, members, viewers and outsiders', async () => {
    await seedProgram();
    for (const uid of [MENTOR_B, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), { docs: [], updatedAt: 2 })
      );
    }
  });

  it('lets facilitators add docs but not edit the pair content', async () => {
    await seedProgram();
    await assertSucceeds(
      updateDoc(doc(as(LEAD), WS_PATH), {
        docs: [
          { id: 'd', title: 'Template', url: 'https://docs.google.com/d' },
        ],
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(as(COLEAD), WS_PATH), {
        taskStatus: { t1: { submittedAt: 2, submittedBy: COLEAD } },
      })
    );
  });

  it('accepts only https doc links, from the pair, facilitators or a new pairing', async () => {
    await seedProgram();
    const link = (url: string, id = 'd') => ({ id, title: 'Doc', url });
    const kept = link('https://docs.google.com/kept', 'k');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `${PLC}/workspaces/${WS_B}`));
    });
    await assertSucceeds(
      updateDoc(doc(as(MENTEE), WS_PATH), { docs: [kept], updatedAt: 2 })
    );
    for (const url of [
      'javascript:alert(1)',
      'http://docs.google.com/d',
      'data:text/html,x',
    ]) {
      for (const uid of [MENTOR, LEAD]) {
        await assertFails(
          updateDoc(doc(as(uid), WS_PATH), {
            docs: [kept, link(url)],
            updatedAt: 3,
          })
        );
      }
      await assertFails(
        setDoc(doc(as(LEAD), `${PLC}/workspaces/${WS_B}`), {
          ...workspace(MENTOR_B, MENTEE_B),
          docs: [link(url)],
        })
      );
    }
    await assertFails(
      updateDoc(doc(as(MENTOR), WS_PATH), {
        docs: [kept, { ...kept, id: 'k2', url: 'javascript:alert(1)' }],
        updatedAt: 3,
      })
    );
    await assertSucceeds(
      updateDoc(doc(as(LEAD), WS_PATH), {
        docs: [kept, link('https://docs.google.com/tpl', 't')],
        updatedAt: 3,
      })
    );
    await assertSucceeds(
      setDoc(doc(as(LEAD), `${PLC}/workspaces/${WS_B}`), {
        ...workspace(MENTOR_B, MENTEE_B),
        docs: [link('https://docs.google.com/b')],
      })
    );
  });

  it('locks out a pair member who became a viewer', async () => {
    await seedProgram();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PLC), {
        [`members.${MENTEE}.role`]: 'viewer',
      });
    });
    await assertSucceeds(getDoc(doc(as(MENTEE), WS_PATH)));
    await assertFails(
      updateDoc(doc(as(MENTEE), WS_PATH), { docs: [], updatedAt: 2 })
    );
  });
});

describe('check-ins', () => {
  const C_PATH = `${WS_PATH}/checkins/c1`;

  it('lets the pair write and facilitators read', async () => {
    await seedProgram();
    await assertSucceeds(setDoc(doc(as(MENTEE), C_PATH), checkin(MENTEE)));
    await assertSucceeds(
      updateDoc(doc(as(MENTOR), C_PATH), { body: 'Updated', updatedAt: 2 })
    );
    for (const uid of [LEAD, COLEAD, MENTOR, MENTEE]) {
      await assertSucceeds(getDoc(doc(as(uid), C_PATH)));
      await assertSucceeds(getDocs(collection(as(uid), `${WS_PATH}/checkins`)));
    }
    await assertSucceeds(deleteDoc(doc(as(MENTOR), C_PATH)));
  });

  it('refuses everyone else', async () => {
    await seedProgram();
    for (const uid of [LEAD, COLEAD, MENTOR_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(setDoc(doc(as(uid), C_PATH), checkin(uid)));
    }
    await seed(C_PATH, checkin(MENTEE));
    for (const uid of [MENTOR_B, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(getDoc(doc(as(uid), C_PATH)));
    }
    for (const uid of [LEAD, MENTOR_B, MEMBER]) {
      await assertFails(updateDoc(doc(as(uid), C_PATH), { body: 'x' }));
    }
    for (const uid of [MENTOR_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(deleteDoc(doc(as(uid), C_PATH)));
    }
    await assertSucceeds(deleteDoc(doc(as(COLEAD), C_PATH)));
    await assertFails(
      setDoc(
        doc(as(MENTOR), `${WS_PATH}/checkins/c2`),
        checkin(MENTEE, { id: 'c2' })
      )
    );
  });
});

describe('submissions', () => {
  const S_PATH = `${WS_PATH}/submissions/t1`;

  it('lets the named submitter submit, and facilitators and the pair read', async () => {
    await seedProgram();
    await assertSucceeds(setDoc(doc(as(MENTEE), S_PATH), submission(MENTEE)));
    for (const uid of [LEAD, COLEAD, MENTOR, MENTEE]) {
      await assertSucceeds(getDoc(doc(as(uid), S_PATH)));
    }
    for (const uid of [MENTOR_B, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(getDoc(doc(as(uid), S_PATH)));
    }
  });

  it('refuses the wrong submitter, other pairs and facilitators', async () => {
    await seedProgram();
    await assertFails(setDoc(doc(as(MENTOR), S_PATH), submission(MENTOR)));
    for (const uid of [LEAD, COLEAD, MENTEE_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(setDoc(doc(as(uid), S_PATH), submission(uid)));
    }
    await assertFails(setDoc(doc(as(MENTEE), S_PATH), submission(MENTOR)));
    await assertFails(
      setDoc(
        doc(as(MENTEE), S_PATH),
        submission(MENTEE, { docUrl: 'javascript:x' })
      )
    );
  });

  it('lets either partner submit a task both submit', async () => {
    await seedProgram();
    await seed(TASK_PATH, task({ submitter: 'both' }));
    await assertSucceeds(setDoc(doc(as(MENTOR), S_PATH), submission(MENTOR)));
    await assertSucceeds(setDoc(doc(as(MENTEE), S_PATH), submission(MENTEE)));
  });

  it('lets only facilitators delete a submission', async () => {
    await seedProgram();
    await seed(S_PATH, submission(MENTEE));
    for (const uid of [MENTOR, MENTEE, MENTOR_B, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(deleteDoc(doc(as(uid), S_PATH)));
    }
    await assertSucceeds(deleteDoc(doc(as(LEAD), S_PATH)));
  });
});

describe('task status on the workspace', () => {
  const S_PATH = `${WS_PATH}/submissions/t1`;
  const mark = (uid: string, at = 2) => ({
    t1: { submittedAt: at, submittedBy: uid },
  });
  const submitWithStatus = (uid: string, status = mark(uid)) => {
    const fs = as(uid);
    const batch = writeBatch(fs);
    batch.set(doc(fs, S_PATH), submission(uid));
    batch.update(doc(fs, WS_PATH), { taskStatus: status, updatedAt: 2 });
    return batch.commit();
  };

  it('lets the named submitter mark a task with its submission', async () => {
    await seedProgram();
    await assertSucceeds(submitWithStatus(MENTEE));
  });

  it('refuses a mentor marking a mentee-only task', async () => {
    await seedProgram();
    await assertFails(submitWithStatus(MENTOR));
    await seed(S_PATH, submission(MENTEE));
    await assertFails(
      updateDoc(doc(as(MENTOR), WS_PATH), {
        taskStatus: mark(MENTOR),
        updatedAt: 2,
      })
    );
  });

  it('refuses marking submitted without a submission', async () => {
    await seedProgram();
    for (const uid of [MENTOR, MENTEE]) {
      await assertFails(
        updateDoc(doc(as(uid), WS_PATH), {
          taskStatus: mark(uid),
          updatedAt: 2,
        })
      );
    }
  });

  it('refuses a status that does not match the submission, or clearing one', async () => {
    await seedProgram();
    await assertFails(submitWithStatus(MENTEE, mark(MENTEE, 99)));
    await seed(S_PATH, submission(MENTEE));
    await seed(WS_PATH, { ...workspace(), taskStatus: mark(MENTEE) });
    await assertFails(
      updateDoc(doc(as(MENTEE), WS_PATH), { taskStatus: {}, updatedAt: 3 })
    );
    await assertFails(
      updateDoc(doc(as(MENTEE), WS_PATH), {
        taskStatus: {
          ...mark(MENTEE),
          t2: { submittedAt: 2, submittedBy: MENTEE },
        },
        updatedAt: 3,
      })
    );
  });

  it('refuses a new pairing that arrives already marked', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), WS_PATH));
    });
    await assertFails(
      setDoc(doc(as(LEAD), WS_PATH), {
        ...workspace(),
        taskStatus: mark(MENTEE),
      })
    );
  });
});
