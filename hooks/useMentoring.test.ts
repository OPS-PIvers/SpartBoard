import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MentoringTask, MentoringWorkspace, Plc } from '@/types';
import type { GoogleDriveService } from '@/utils/googleDriveService';
import {
  BATCH_LIMIT,
  copyTemplateIntoWorkspaces,
  ensureWorkspaceTemplates,
  resetTemplateAttempts,
  removePairing,
  submitMentoringTask,
} from './useMentoring';

const fs = vi.hoisted(() => {
  const txUpdates: { path: string; data: Record<string, unknown> }[] = [];
  const batches: {
    deletes: string[];
    sets: string[];
    updates: Record<string, unknown>[];
    commit: ReturnType<typeof vi.fn>;
  }[] = [];
  const subcollections: Record<string, number> = {};
  const order: string[] = [];
  const existingDocs: Record<string, { id: string; url: string }[]> = {};
  return { txUpdates, batches, subcollections, order, existingDocs };
});

vi.mock('firebase/firestore', () => {
  const ref = (parent: unknown, segs: string[]) => {
    const base =
      parent && typeof parent === 'object' && 'path' in parent
        ? [(parent as { path: string }).path]
        : [];
    return { path: [...base, ...segs].join('/') };
  };
  return {
    doc: vi.fn((parent: unknown, ...segs: string[]) => ref(parent, segs)),
    collection: vi.fn((parent: unknown, ...segs: string[]) =>
      ref(parent, segs)
    ),
    getDocs: vi.fn((col: { path: string }) => {
      const n = fs.subcollections[col.path] ?? 0;
      return Promise.resolve({
        docs: Array.from({ length: n }, (_, i) => ({
          ref: { path: `${col.path}/d${i}` },
        })),
      });
    }),
    writeBatch: vi.fn(() => {
      const batch = {
        deletes: [] as string[],
        sets: [] as string[],
        updates: [] as Record<string, unknown>[],
        set: (r: { path: string }) => batch.sets.push(r.path),
        update: (_r: unknown, d: Record<string, unknown>) =>
          batch.updates.push(d),
        commit: vi.fn(() => {
          fs.order.push('commit');
          return Promise.resolve();
        }),
        delete: (r: { path: string }) => batch.deletes.push(r.path),
      };
      fs.batches.push(batch);
      return batch;
    }),
    deleteDoc: vi.fn((r: { path: string }) => {
      fs.order.push(`delete:${r.path}`);
      return Promise.resolve();
    }),
    runTransaction: vi.fn(
      async (
        _db: unknown,
        fn: (tx: {
          get: (r: { path: string }) => Promise<unknown>;
          update: (r: { path: string }, d: Record<string, unknown>) => void;
        }) => Promise<unknown>
      ) =>
        fn({
          get: (r) =>
            Promise.resolve({
              id: r.path.split('/').pop(),
              exists: () => true,
              data: () => ({
                mentorUid: 'm',
                menteeUid: 'e',
                docs: fs.existingDocs[r.path] ?? [],
              }),
            }),
          update: (r, data) => fs.txUpdates.push({ path: r.path, data }),
        })
    ),
    serverTimestamp: vi.fn(() => '__ts__'),
  };
});
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const member = (uid: string, email = `${uid}@x.org`) => ({
  uid,
  email,
  displayName: uid.toUpperCase(),
  role: 'member',
  joinedAt: 0,
  status: 'active',
});

const workspace = (n: number): MentoringWorkspace => ({
  id: `m${n}_e${n}`,
  mentorUid: `m${n}`,
  menteeUid: `e${n}`,
  memberUids: [`m${n}`, `e${n}`],
  mentorName: '',
  menteeName: '',
  actionItems: [],
  docs: [],
  taskStatus: {},
  createdAt: 0,
  updatedAt: 0,
});

const plcWith = (n: number, noEmail: string[] = []): Plc =>
  ({
    id: 'p',
    members: Object.fromEntries(
      Array.from({ length: n }, (_, i) => i).flatMap(
        (i): [string, ReturnType<typeof member>][] => [
          [
            `m${i}`,
            member(`m${i}`, noEmail.includes(`m${i}`) ? '' : undefined),
          ],
          [`e${i}`, member(`e${i}`)],
        ]
      )
    ),
  }) as unknown as Plc;

const input = {
  title: 'Goals',
  instructions: '',
  dueDate: '2026-10-30',
  submitter: 'mentee' as const,
  templateDoc: {
    title: 'Goals',
    url: 'https://docs.google.com/document/d/tpl/edit',
    fileId: 'tpl',
  },
};

const makeDrive = (failEmail?: string) => {
  let inFlight = 0;
  let peak = 0;
  let next = 0;
  const drive = {
    copyFile: vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      next += 1;
      return {
        id: `copy${next}`,
        webViewLink: `https://docs.google.com/c${next}`,
      };
    }),
    addEditorPermission: vi.fn((_id: string, email: string) =>
      email === failEmail ? Promise.reject(new Error('403')) : Promise.resolve()
    ),
    trashFile: vi.fn(() => Promise.resolve()),
  };
  return {
    drive,
    service: drive as unknown as GoogleDriveService,
    peak: () => peak,
  };
};

beforeEach(() => {
  resetTemplateAttempts();
  for (const k of Object.keys(fs.existingDocs)) delete fs.existingDocs[k];
  fs.txUpdates.length = 0;
  fs.batches.length = 0;
  fs.order.length = 0;
  for (const k of Object.keys(fs.subcollections)) delete fs.subcollections[k];
});

describe('copyTemplateIntoWorkspaces', () => {
  it('skips and reports a pair whose share fails, trashing its copy, and keeps going', async () => {
    const { drive, service } = makeDrive('m1@x.org');
    const failed = await copyTemplateIntoWorkspaces(
      plcWith(3),
      { ...input, id: 't1' },
      [0, 1, 2].map(workspace),
      'lead',
      service
    );
    expect(failed).toEqual(['M1 and E1']);
    expect(drive.copyFile).toHaveBeenCalledTimes(3);
    expect(drive.copyFile).toHaveBeenCalledWith('tpl', expect.any(String));
    expect(drive.trashFile).toHaveBeenCalledTimes(1);
    const written = fs.txUpdates.map((u) => u.path).sort();
    expect(written).toEqual([
      'plcs/p/workspaces/m0_e0',
      'plcs/p/workspaces/m2_e2',
    ]);
    for (const u of fs.txUpdates) {
      const docs = u.data.docs as { url: string }[];
      expect(docs[0].url).not.toContain('/d/tpl/');
    }
  });

  it('trashes the copy when a pair member has no email', async () => {
    const { drive, service } = makeDrive();
    const failed = await copyTemplateIntoWorkspaces(
      plcWith(1, ['m0']),
      { ...input, id: 't1' },
      [workspace(0)],
      'lead',
      service
    );
    expect(failed).toEqual(['M0 and E0']);
    expect(drive.trashFile).toHaveBeenCalledWith('copy1');
    expect(fs.txUpdates).toHaveLength(0);
  });

  it('never falls back to the shared template without Drive', async () => {
    const failed = await copyTemplateIntoWorkspaces(
      plcWith(2),
      { ...input, id: 't1' },
      [0, 1].map(workspace),
      'lead',
      null
    );
    expect(failed).toEqual(['M0 and E0', 'M1 and E1']);
    expect(fs.txUpdates).toHaveLength(0);
  });

  it('copies at most four at a time', async () => {
    const { drive, service, peak } = makeDrive();
    const failed = await copyTemplateIntoWorkspaces(
      plcWith(9),
      { ...input, id: 't1' },
      Array.from({ length: 9 }, (_, i) => workspace(i)),
      'lead',
      service
    );
    expect(failed).toEqual([]);
    expect(drive.copyFile).toHaveBeenCalledTimes(9);
    expect(peak()).toBeLessThanOrEqual(4);
    expect(peak()).toBeGreaterThan(1);
  });

  it('does nothing without a template', async () => {
    const { drive, service } = makeDrive();
    expect(
      await copyTemplateIntoWorkspaces(
        plcWith(1),
        { ...input, id: 't1', templateDoc: null },
        [workspace(0)],
        'lead',
        service
      )
    ).toEqual([]);
    expect(drive.copyFile).not.toHaveBeenCalled();
  });
});

describe('removePairing', () => {
  it('deletes check-ins and submissions in batches before the workspace', async () => {
    const ws = 'plcs/p/workspaces/m_e';
    fs.subcollections[`${ws}/checkins`] = BATCH_LIMIT + 40;
    fs.subcollections[`${ws}/submissions`] = 30;
    await removePairing('p', 'm_e');
    expect(fs.batches.map((b) => b.deletes.length)).toEqual([BATCH_LIMIT, 70]);
    expect(fs.order).toEqual(['commit', 'commit', `delete:${ws}`]);
  });

  it('deletes just the workspace when it has no notes or submissions', async () => {
    await removePairing('p', 'm_e');
    expect(fs.batches).toHaveLength(0);
    expect(fs.order).toEqual(['delete:plcs/p/workspaces/m_e']);
  });
});

describe('submitMentoringTask', () => {
  const both: MentoringTask = {
    id: 't1',
    title: 'Goals',
    instructions: '',
    dueDate: '2026-10-30',
    submitter: 'both',
    templateDoc: null,
    createdBy: 'lead',
    createdAt: 0,
    updatedAt: 0,
  };
  const ws = (taskStatus: MentoringWorkspace['taskStatus']) => ({
    ...workspace(0),
    taskStatus,
  });

  it('lets the second partner hand in their own submission and mark', async () => {
    await submitMentoringTask(
      'p',
      ws({ t1_e0: { submittedAt: 1, submittedBy: 'e0' } }),
      both,
      { uid: 'm0', displayName: 'M' }
    );
    const [batch] = fs.batches;
    expect(batch.sets).toEqual(['plcs/p/workspaces/m0_e0/submissions/t1_m0']);
    expect(Object.keys(batch.updates[0])).toContain('taskStatus.t1_m0');
  });

  it('does not re-mark a partner who already handed in', async () => {
    await submitMentoringTask(
      'p',
      ws({ t1_m0: { submittedAt: 1, submittedBy: 'm0' } }),
      both,
      { uid: 'm0', displayName: 'M' }
    );
    expect(fs.batches[0].sets).toHaveLength(1);
    expect(fs.batches[0].updates).toHaveLength(0);
  });
});

describe('ensureWorkspaceTemplates', () => {
  const tpl: MentoringTask = {
    id: 't1',
    title: 'Goals',
    instructions: '',
    dueDate: '2026-10-30',
    submitter: 'mentee',
    templateDoc: input.templateDoc,
    createdBy: 'lead',
    createdAt: 0,
    updatedAt: 0,
  };
  const noTemplate: MentoringTask = { ...tpl, id: 't2', templateDoc: null };

  it('copies a missing template once, for a failed or late-added pair', async () => {
    const { drive, service } = makeDrive();
    const ws = workspace(0);
    expect(
      await ensureWorkspaceTemplates(
        plcWith(1),
        [tpl, noTemplate],
        ws,
        'lead',
        service
      )
    ).toBe(1);
    expect(drive.copyFile).toHaveBeenCalledTimes(1);
    expect(fs.txUpdates).toHaveLength(1);
    expect(
      await ensureWorkspaceTemplates(plcWith(1), [tpl], ws, 'lead', service)
    ).toBe(0);
    expect(drive.copyFile).toHaveBeenCalledTimes(1);
  });

  it('skips a workspace that already lists the copy', async () => {
    const { drive, service } = makeDrive();
    const ws = {
      ...workspace(0),
      docs: [
        {
          id: 'task-t1',
          title: 'Goals',
          url: 'https://docs.google.com/c',
          addedBy: 'lead',
          addedAt: 0,
        },
      ],
    };
    await ensureWorkspaceTemplates(plcWith(1), [tpl], ws, 'lead', service);
    expect(drive.copyFile).not.toHaveBeenCalled();
  });

  it('trashes its copy when another opener listed one first', async () => {
    const { drive, service } = makeDrive();
    fs.existingDocs['plcs/p/workspaces/m0_e0'] = [
      { id: 'task-t1', url: 'https://docs.google.com/other' },
    ];
    expect(
      await ensureWorkspaceTemplates(
        plcWith(1),
        [tpl],
        workspace(0),
        'lead',
        service
      )
    ).toBe(0);
    expect(drive.trashFile).toHaveBeenCalledWith('copy1');
    expect(fs.txUpdates).toHaveLength(0);
  });

  it('trashes a failed copy and does nothing without Drive', async () => {
    const { drive, service } = makeDrive('e0@x.org');
    await ensureWorkspaceTemplates(
      plcWith(1),
      [tpl],
      workspace(0),
      'lead',
      service
    );
    expect(drive.trashFile).toHaveBeenCalledWith('copy1');
    expect(fs.txUpdates).toHaveLength(0);
    resetTemplateAttempts();
    expect(
      await ensureWorkspaceTemplates(
        plcWith(1),
        [tpl],
        workspace(0),
        'lead',
        null
      )
    ).toBe(0);
  });
});
