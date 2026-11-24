import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStudentHelpTours } from './useStudentHelpTours';

type Where = [string, string, unknown];
const h = vi.hoisted(() => ({
  queries: [] as Where[][],
  results: new Map<string, { id: string; data: () => unknown }[]>(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  where: (f: string, op: string, v: unknown) => [f, op, v],
  query: (_c: unknown, ...w: Where[]) => w,
  onSnapshot: (
    w: Where[],
    next: (s: { docs: { id: string; data: () => unknown }[] }) => void
  ) => {
    h.queries.push(w);
    const org = w.find(([f]) => f === 'orgId')?.[2];
    next({ docs: h.results.get(String(org)) ?? [] });
    return () => undefined;
  },
}));

const raw = (
  id: string,
  title: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  data: () => ({
    kind: 'guided-learning',
    title,
    setId: `set-${id}`,
    audience: 'students',
    visible: true,
    categoryId: 'c',
    order: 0,
    ...extra,
  }),
});

beforeEach(() => {
  h.queries = [];
  h.results.clear();
});

describe('useStudentHelpTours', () => {
  it('asks only for Published students items, global and in the org', () => {
    h.results.set('null', [raw('g', 'Global')]);
    h.results.set('orono', [raw('o', 'Org')]);
    const { result } = renderHook(() => useStudentHelpTours('orono'));
    for (const w of h.queries) {
      expect(w).toContainEqual(['audience', '==', 'students']);
      expect(w).toContainEqual(['visible', '==', true]);
    }
    expect(h.queries.map((w) => w[0][2])).toEqual([null, 'orono']);
    expect(result.current.map((i) => i.title).sort()).toEqual([
      'Global',
      'Org',
    ]);
  });

  it('skips embeds and tours with no set', () => {
    h.results.set('null', [
      raw('e', 'Embed', { kind: 'embed', setId: null, url: 'https://x' }),
    ]);
    const { result } = renderHook(() => useStudentHelpTours(null));
    expect(result.current).toEqual([]);
    expect(h.queries).toHaveLength(1);
  });
});
