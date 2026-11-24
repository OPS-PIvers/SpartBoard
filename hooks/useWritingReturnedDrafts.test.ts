import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listened: unknown[] = [];
let docs: Array<{ id: string; data: () => unknown }> = [];
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (n: number) => ({ limit: n }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  doc: () => {
    throw new Error('one listener per copy');
  },
  onSnapshot: (ref: unknown, next: (snap: { docs: typeof docs }) => void) => {
    listened.push(ref);
    next({ docs });
    return () => undefined;
  },
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

import { useWritingReturnedDrafts } from './useWritingReturnedDrafts';

describe('useWritingReturnedDrafts', () => {
  beforeEach(() => {
    listened.length = 0;
    docs = [{ id: '3', data: () => ({ number: 3, returnedAt: 9 }) }];
  });

  it('reads the returned copies with one query', () => {
    const { result } = renderHook(() =>
      useWritingReturnedDrafts('S1', 'stu', 9)
    );
    expect(listened).toEqual([
      {
        ref: 'writing_assignment_sessions/S1/responses/stu/drafts',
        constraints: [
          { where: ['returnedAt', '>', 0] },
          { orderBy: ['returnedAt', 'desc'] },
          { limit: 50 },
        ],
      },
    ]);
    expect(result.current).toEqual([{ id: '3', number: 3, returnedAt: 9 }]);
  });

  it('opens nothing before the work is returned', () => {
    const { result } = renderHook(() =>
      useWritingReturnedDrafts('S1', 'stu', undefined)
    );
    expect(listened).toEqual([]);
    expect(result.current).toEqual([]);
  });
});
