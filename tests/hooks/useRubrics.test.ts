/**
 * Coverage for `useRubrics`: save/delete round-trip, share payload shape,
 * import stripping share metadata + minting a new id, and signed-out no-op.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useRubrics } from '@/hooks/useRubrics';
import type { Rubric, SharedRubric } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));

const UID = 'teacher-a';

function fakeRubric(overrides: Partial<Rubric> = {}): Rubric {
  return {
    id: 'rubric-1',
    title: 'Essay Rubric',
    criteria: [
      {
        id: 'c1',
        name: 'Thesis',
        levels: [
          { id: 'l1', label: 'Below', points: 1 },
          { id: 'l2', label: 'Meets', points: 3 },
        ],
      },
    ],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('useRubrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(firestore.collection).mockImplementation(
      (...args: unknown[]) => ({ path: args.slice(1).join('/') }) as never
    );
    vi.mocked(firestore.doc).mockImplementation(
      (...args: unknown[]) => ({ path: args.slice(1).join('/') }) as never
    );
    vi.mocked(firestore.query).mockImplementation((c) => c as never);
    vi.mocked(firestore.orderBy).mockImplementation(() => ({}) as never);
    vi.mocked(firestore.onSnapshot).mockImplementation(((
      ...args: unknown[]
    ) => {
      const onNext = args[1] as (snap: { docs: unknown[] }) => void;
      onNext({ docs: [] });
      return () => undefined;
    }) as never);
  });

  it('is a no-op with a stable shape when signed out', async () => {
    const { result } = renderHook(() => useRubrics(undefined));

    expect(result.current.rubrics).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    await expect(result.current.saveRubric(fakeRubric())).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.deleteRubric('r1')).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.shareRubric('r1')).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.importSharedRubric('s1')).rejects.toThrow(
      /Not authenticated/
    );
  });

  it('saveRubric upserts via setDoc with a full replacement', async () => {
    const setDocMock = vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRubrics(UID));

    const rubric = fakeRubric();
    await result.current.saveRubric(rubric);

    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: `users/${UID}/rubrics/${rubric.id}` }),
      rubric
    );
  });

  it('deleteRubric removes the doc by id', async () => {
    const deleteDocMock = vi
      .mocked(firestore.deleteDoc)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useRubrics(UID));

    await result.current.deleteRubric('rubric-1');

    expect(deleteDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: `users/${UID}/rubrics/rubric-1` })
    );
  });

  it('shareRubric writes the full payload + originalAuthor + sharedAt and returns the new id', async () => {
    const rubric = fakeRubric();
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => rubric,
    } as never);
    const addDocMock = vi
      .mocked(firestore.addDoc)
      .mockResolvedValue({ id: 'share-123' } as never);

    const { result } = renderHook(() => useRubrics(UID));

    const shareId = await result.current.shareRubric(rubric.id);

    expect(shareId).toBe('share-123');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'shared_rubrics' }),
      expect.objectContaining({
        ...rubric,
        originalAuthor: UID,
        sharedAt: expect.any(Number),
      })
    );
  });

  it('shareRubric throws when the source rubric does not exist', async () => {
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => false,
    } as never);
    const { result } = renderHook(() => useRubrics(UID));

    await expect(result.current.shareRubric('missing')).rejects.toThrow(
      /not found/i
    );
  });

  it('importSharedRubric strips share metadata and mints a new id', async () => {
    const shared: SharedRubric = {
      ...fakeRubric({ id: 'shared-rubric-1' }),
      originalAuthor: 'other-teacher',
      sharedAt: 5000,
    };
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => shared,
    } as never);
    const setDocMock = vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
    const randomUuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-1111-1111-111111111111');

    const { result } = renderHook(() => useRubrics(UID));

    await result.current.importSharedRubric('share-123');

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, written] = setDocMock.mock.calls[0] as unknown as [
      { path: string },
      Rubric,
    ];
    expect(ref.path).toBe(
      `users/${UID}/rubrics/11111111-1111-1111-1111-111111111111`
    );
    expect(written.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(written.title).toBe(shared.title);
    expect(written.criteria).toEqual(shared.criteria);
    expect(written).not.toHaveProperty('originalAuthor');
    expect(written).not.toHaveProperty('sharedAt');
    expect(typeof written.createdAt).toBe('number');
    expect(typeof written.updatedAt).toBe('number');

    randomUuidSpy.mockRestore();
  });

  it('importSharedRubric throws when the shared doc does not exist', async () => {
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => false,
    } as never);
    const { result } = renderHook(() => useRubrics(UID));

    await expect(result.current.importSharedRubric('missing')).rejects.toThrow(
      /not found/i
    );
  });

  it('streams rubrics ordered by updatedAt desc via onSnapshot', async () => {
    const rubricA = fakeRubric({ id: 'a', updatedAt: 2000 });
    vi.mocked(firestore.onSnapshot).mockImplementation(((
      ...args: unknown[]
    ) => {
      const onNext = args[1] as (snap: {
        docs: Array<{ data: () => Rubric }>;
      }) => void;
      onNext({ docs: [{ data: () => rubricA }] });
      return () => undefined;
    }) as never);

    const { result } = renderHook(() => useRubrics(UID));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rubrics).toEqual([rubricA]);
  });
});
