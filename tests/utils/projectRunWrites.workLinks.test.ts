// D40: work links go to private/work, never the group doc.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectWorkLink } from '@/types';

const setDocMock = vi.fn().mockResolvedValue(undefined);
const addDocMock = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args) as Promise<void>,
  arrayRemove: (...items: unknown[]) => ({ __remove: items }),
  arrayUnion: (...items: unknown[]) => ({ __union: items }),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  deleteField: vi.fn(),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  setDoc: (...args: unknown[]) => setDocMock(...args) as Promise<void>,
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const { writeWorkLink, removeWorkLinkWrite } =
  await import('@/utils/projectRunWrites');

const RUN = 'teacher-1_p-1';
const link = (id: string): ProjectWorkLink => ({
  id,
  url: `https://example.com/${id}`,
  addedByUid: 'student-1',
  addedAt: 1,
});

describe('work links (D40)', () => {
  beforeEach(() => vi.clearAllMocks());

  const actor = { uid: 'student-1', role: 'student' as const };

  it('adds to private/work, never the group doc', async () => {
    await writeWorkLink({} as never, RUN, 'g1', link('a'), actor);
    const [ref, data, options] = setDocMock.mock.calls[0] as [
      { path: string },
      Record<string, unknown>,
      unknown,
    ];
    expect(ref.path).toBe(`project_runs/${RUN}/groups/g1/private/work`);
    expect(data.workLinks).toEqual({ __union: [link('a')] });
    expect(options).toEqual({ merge: true });
  });

  it('carries legacy links across on the first write', async () => {
    await writeWorkLink({} as never, RUN, 'g1', link('b'), actor, [link('a')]);
    const data = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(data.workLinks).toEqual({ __union: [link('a'), link('b')] });
  });

  it('removes with arrayRemove once private/work exists', async () => {
    await removeWorkLinkWrite({} as never, RUN, 'g1', link('a'));
    const data = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(data.workLinks).toEqual({ __remove: [link('a')] });
  });

  it('seeds the legacy list minus the removed link otherwise', async () => {
    await removeWorkLinkWrite({} as never, RUN, 'g1', link('a'), [
      link('a'),
      link('b'),
    ]);
    const data = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(data.workLinks).toEqual([link('b')]);
  });
});
