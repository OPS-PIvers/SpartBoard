import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { writePlcFlashcardSetEntry } from '@/hooks/usePlcFlashcards';
import type { FlashcardSet } from '@/types';

const DELETE_FIELD = { __deleteField: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const set: FlashcardSet = {
  id: 'set-1',
  title: 'Unit 4 vocab',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: [{ id: 'c1', term: 'perro', definition: 'dog' }],
  folderId: null,
  createdAt: 1,
  updatedAt: 2,
};
const input = { set, sharedByName: 'Ada', sharedByEmail: 'a@x' };
const snapshot = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
});

describe('writePlcFlashcardSetEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports already-shared and writes nothing for a live entry', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot({}) as never);
    expect(await writePlcFlashcardSetEntry('plc-1', 'u1', input)).toBe(
      'already-shared'
    );
    expect(updateDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('updates a live entry content-only when asked', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot({}) as never);
    expect(
      await writePlcFlashcardSetEntry('plc-1', 'u1', { ...input, update: true })
    ).toBe('updated');
    const payload = vi.mocked(updateDoc).mock.calls[0][1] as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload).sort()).toEqual([
      'cards',
      'definitionLanguage',
      'deletedAt',
      'description',
      'termLanguage',
      'title',
      'updatedAt',
    ]);
    expect(payload.cards).toEqual(set.cards);
  });

  it('still revives a tombstone as restored', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot({ deletedAt: 5 }) as never);
    expect(
      await writePlcFlashcardSetEntry('plc-1', 'u1', { ...input, update: true })
    ).toBe('restored');
  });
});
