import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MentoringWorkspace, Plc } from '@/types';
import type { GoogleDriveService } from '@/utils/googleDriveService';
import {
  BATCH_LIMIT,
  copyTemplateIntoWorkspaces,
  removePairing,
} from './useMentoring';

const fs = vi.hoisted(() => {
  const txUpdates: { path: string; data: Record<string, unknown> }[] = [];
  const batches: { deletes: string[]; commit: ReturnType<typeof vi.fn> }[] = [];
  const subcollections: Record<string, number> = {};
  const order: string[] = [];
  return { txUpdates, batches, subcollections, order };
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
        }) => Promise<void>
      ) =>
        fn({
          get: (r) =>
            Promise.resolve({
              id: r.path.split('/').pop(),
              exists: () => true,
              data: () => ({ mentorUid: 'm', menteeUid: 'e', docs: [] }),
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
      't1',
      input,
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
      't1',
      input,
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
      't1',
      input,
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
      't1',
      input,
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
        't1',
        { ...input, templateDoc: null },
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
