import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, Record<string, unknown>>();
const setDocMock = vi.fn(
  (ref: { path: string }, data: Record<string, unknown>) => {
    if (!ref.path.startsWith('admin_audit_log/')) store.set(ref.path, data);
    return Promise.resolve();
  }
);
const getDocMock = vi.fn((ref: { path: string }) => {
  const data = store.get(ref.path);
  return Promise.resolve({
    exists: () => data !== undefined,
    data: () => data,
    get: (field: string) =>
      field
        .split('.')
        .reduce<unknown>(
          (v, k) =>
            v && typeof v === 'object'
              ? (v as Record<string, unknown>)[k]
              : undefined,
          data
        ),
  });
});
let autoId = 0;

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ path: name }),
  doc: (parent: unknown, ...segments: string[]) =>
    segments.length > 0
      ? { path: segments.join('/') }
      : { path: `${(parent as { path: string }).path}/auto${++autoId}` },
  getDoc: (ref: { path: string }) => getDocMock(ref),
  setDoc: (ref: { path: string }, data: Record<string, unknown>) =>
    setDocMock(ref, data),
  serverTimestamp: () => 'SERVER_TS',
  FieldValue: class FieldValue {
    constructor(readonly _methodName: string) {}
  },
  Timestamp: class Timestamp {
    constructor(readonly ms: number) {}
    toMillis() {
      return this.ms;
    }
  },
  DocumentReference: class DocumentReference {
    constructor(readonly path: string) {}
  },
}));

vi.mock('firebase/auth', () => ({ onIdTokenChanged: vi.fn() }));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'teacher-uid',
      email: 'Teacher@Orono.k12.mn.us',
      getIdTokenResult: () =>
        Promise.resolve({
          claims: {
            email: 'Teacher@Orono.k12.mn.us',
            viewAs: { by: 'admin@orono.k12.mn.us', sid: 'sid-1', ro: false },
          },
        }),
    },
  },
}));

const auditWrites = () =>
  setDocMock.mock.calls.filter(([ref]) =>
    ref.path.startsWith('admin_audit_log/')
  );

describe('viewAsDirectSave', () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
    setDocMock.mockClear();
    window.history.replaceState({}, '', '/');
  });

  it('only runs the write outside view-as', async () => {
    const { viewAsDirectSave } = await import('./viewAsAudit');
    const write = vi.fn(() => Promise.resolve('ok'));
    await expect(
      viewAsDirectSave(
        { path: 'users/u/userProfile/profile' } as never,
        ['a'],
        write
      )
    ).resolves.toBe('ok');
    expect(write).toHaveBeenCalledOnce();
    expect(getDocMock).not.toHaveBeenCalled();
    expect(auditWrites()).toHaveLength(0);
  });

  it('audits changed fields, bumps the toast, and skips no-op saves when unlocked', async () => {
    window.history.replaceState({}, '', '/?viewAs=1');
    const tab = await import('./viewAsTab');
    tab.updateViewAsTabState({ unlocked: true, ended: false, savedNotice: 0 });
    const { viewAsDirectSave } = await import('./viewAsAudit');
    const path = 'users/teacher-uid/userProfile/profile';
    store.set(path, { language: 'en', savedWidgetConfigs: { quiz: { a: 1 } } });
    const ref = { path } as never;

    await viewAsDirectSave(ref, ['language', 'savedWidgetConfigs.quiz'], () => {
      store.set(path, {
        language: 'es',
        savedWidgetConfigs: { quiz: { a: 1 } },
      });
      return Promise.resolve();
    });

    const [[, entry]] = auditWrites();
    expect(entry).toEqual({
      action: 'view_as_save',
      sid: 'sid-1',
      email: 'admin@orono.k12.mn.us',
      targetEmail: 'teacher@orono.k12.mn.us',
      targetUid: 'teacher-uid',
      path,
      before: { language: 'en' },
      after: { language: 'es' },
      timestamp: 'SERVER_TS',
    });
    expect(tab.getViewAsTabState().savedNotice).toBe(1);

    await viewAsDirectSave(ref, ['language'], () => Promise.resolve());
    expect(auditWrites()).toHaveLength(1);
  });

  it('logs a deleted field as missing from after', async () => {
    window.history.replaceState({}, '', '/?viewAs=1');
    const tab = await import('./viewAsTab');
    tab.updateViewAsTabState({ unlocked: true, ended: false });
    const { viewAsDirectSave } = await import('./viewAsAudit');
    const path = 'users/teacher-uid/userProfile/profile';
    store.set(path, { penColors: ['#000'] });
    await viewAsDirectSave({ path } as never, ['penColors'], () => {
      store.set(path, {});
      return Promise.resolve();
    });
    const [[, entry]] = auditWrites();
    expect(entry.before).toEqual({ penColors: ['#000'] });
    expect(entry.after).toEqual({});
  });
});

describe('recordViewAsRawWrites', () => {
  beforeEach(() => {
    vi.resetModules();
    setDocMock.mockClear();
  });

  it('logs nothing outside an unlocked tab', async () => {
    window.history.replaceState({}, '', '/');
    const { recordViewAsRawWrites } = await import('./viewAsAudit');
    await recordViewAsRawWrites([{ op: 'delete', path: 'quiz_sessions/s' }]);
    expect(auditWrites()).toHaveLength(0);
  });

  it('logs a change with plain data, and keeps the path only for one write in their account', async () => {
    window.history.replaceState({}, '', '/?viewAs=1');
    const tab = await import('./viewAsTab');
    tab.updateViewAsTabState({
      unlocked: true,
      ended: false,
      savedNotice: 0,
      session: {
        sid: 'sid-1',
        token: 't',
        targetUid: 'teacher-uid',
        targetEmail: 'teacher@orono.k12.mn.us',
        adminTarget: false,
        expiresAt: 0,
      },
    });
    const fs = await import('firebase/firestore');
    const { recordViewAsRawWrites } = await import('./viewAsAudit');
    const FieldValue = fs.FieldValue as unknown as new (n: string) => object;
    const Timestamp = fs.Timestamp as unknown as new (ms: number) => object;

    await recordViewAsRawWrites([
      {
        op: 'update',
        path: 'quiz_sessions/s1/responses/r1',
        data: {
          unlocked: true,
          unlockKind: 'reopen',
          at: new FieldValue('serverTimestamp'),
          due: new Timestamp(5),
          gone: undefined,
        },
      },
    ]);
    await recordViewAsRawWrites([
      { op: 'set', path: 'users/teacher-uid/rosters/r1', data: { n: 1 } },
    ]);

    const [[, outside], [, own]] = auditWrites();
    expect(outside).toMatchObject({
      action: 'view_as_outward',
      targetUid: 'teacher-uid',
      after: {
        action: 'Change',
        writes: [
          {
            op: 'update',
            path: 'quiz_sessions/s1/responses/r1',
            data: {
              unlocked: true,
              unlockKind: 'reopen',
              at: '<serverTimestamp>',
              due: 5,
            },
          },
        ],
      },
    });
    expect(outside).not.toHaveProperty('path');
    expect(own.path).toBe('users/teacher-uid/rosters/r1');
    expect(tab.getViewAsTabState().savedNotice).toBe(2);
  });

  it("keeps every path of a large batch and caps only each write's data", async () => {
    window.history.replaceState({}, '', '/?viewAs=1');
    const tab = await import('./viewAsTab');
    tab.updateViewAsTabState({ unlocked: true, ended: false });
    const { recordViewAsRawWrites } = await import('./viewAsAudit');
    const big = 'x'.repeat(30_000);
    await recordViewAsRawWrites(
      Array.from({ length: 10 }, (_, i) => ({
        op: 'set' as const,
        path: `users/teacher-uid/miniapps/a${i}`,
        data: { html: big, order: i },
      }))
    );
    const [[, entry]] = auditWrites();
    const writes = (entry.after as { writes: Record<string, unknown>[] })
      .writes;
    expect(writes.map((w) => w.path)).toEqual(
      Array.from({ length: 10 }, (_, i) => `users/teacher-uid/miniapps/a${i}`)
    );
    expect(Object.keys(writes[0].data as object)).toEqual(['__viewAsOmitted']);
  });
});
