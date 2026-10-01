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
