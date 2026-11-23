import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import { useTourAuthor } from './useTourAuthor';

const store = vi.hoisted(() => ({ listed: new Set<string>(), reads: 0 }));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: (ref: { id: string }) => {
    store.reads += 1;
    return Promise.resolve({ exists: () => store.listed.has(ref.id) });
  },
}));

function wrap(value: Partial<AuthContextType>) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider value={value as AuthContextType}>
      {children}
    </AuthContext.Provider>
  );
  return Wrapper;
}

const person = (email: string, isAdmin: boolean | null, enabled?: boolean) =>
  wrap({
    user: { uid: 'u1', email } as AuthContextType['user'],
    loading: false,
    isAdmin,
    canAccessFeature: () => true,
    globalPermissions:
      enabled === undefined
        ? []
        : ([
            { featureId: 'web-tours', enabled },
          ] as AuthContextType['globalPermissions']),
  });

describe('useTourAuthor', () => {
  beforeEach(() => {
    store.listed.clear();
    store.reads = 0;
  });

  it('treats an admin as an author without a lookup', () => {
    const { result } = renderHook(() => useTourAuthor(), {
      wrapper: person('admin@orono.k12.mn.us', true),
    });
    expect(result.current).toMatchObject({
      ready: true,
      admin: true,
      author: true,
    });
    expect(result.current.passes('web-tours')).toBe(true);
    expect(store.reads).toBe(0);
  });

  it('finds a listed author and passes a flag with no saved record', async () => {
    store.listed.add('listed@orono.k12.mn.us');
    const { result } = renderHook(() => useTourAuthor(), {
      wrapper: person('Listed@orono.k12.mn.us', false),
    });
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toMatchObject({ admin: false, author: true });
    expect(result.current.passes('web-tours')).toBe(true);
  });

  it('fails a listed author when the flag is switched off', async () => {
    store.listed.add('off@orono.k12.mn.us');
    const { result } = renderHook(() => useTourAuthor(), {
      wrapper: person('off@orono.k12.mn.us', false, false),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.author).toBe(true);
    expect(result.current.passes('web-tours')).toBe(false);
  });

  it('turns away someone who is not on the list', async () => {
    const { result } = renderHook(() => useTourAuthor(), {
      wrapper: person('teacher@orono.k12.mn.us', false),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.author).toBe(false);
    expect(result.current.passes('web-tours')).toBe(false);
  });

  it('is not ready while admin status loads', () => {
    const { result } = renderHook(() => useTourAuthor(), {
      wrapper: person('wait@orono.k12.mn.us', null),
    });
    expect(result.current.ready).toBe(false);
  });
});
