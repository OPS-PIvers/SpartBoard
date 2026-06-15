import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import { readAllDocsPaged, FIRESTORE_PAGE_SIZE } from './firestorePaging';

vi.mock('firebase/firestore');

type MockDoc = { id: string };

/**
 * Build a fake page snapshot whose `.docs` array has the requested length.
 * `readAllDocsPaged` only reads `pageSnap.docs` (length + last element as the
 * cursor), so minimal stand-in docs are sufficient.
 */
function makeSnap(docs: MockDoc[]): { docs: MockDoc[] } {
  return { docs };
}

describe('readAllDocsPaged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `query`/`orderBy`/`startAfter`/`limit`/`documentId` are only used to
    // assemble the page query; return opaque tokens so the loop can run.
    (firestore.query as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => ({ __query: args })
    );
    (firestore.orderBy as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      'orderBy'
    );
    (
      firestore.startAfter as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue('startAfter');
    (firestore.limit as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (n: number) => ({ __limit: n })
    );
    (
      firestore.documentId as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue('documentId');
  });

  it('reads a single page when the result fits under the page size', async () => {
    const docs: MockDoc[] = [{ id: 'a' }, { id: 'b' }];
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(makeSnap(docs));

    const result = await readAllDocsPaged(
      {} as firestore.Query,
      /* pageSize */ 10
    );

    expect(firestore.getDocs).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    // No cursor used on the first (and only) page.
    expect(firestore.startAfter).not.toHaveBeenCalled();
  });

  it('pages a large result set in bounded chunks and visits every doc', async () => {
    const pageSize = 3;
    // 7 docs => pages of 3, 3, 1 (last page short => loop terminates).
    const all: MockDoc[] = Array.from({ length: 7 }, (_, i) => ({
      id: `d${i}`,
    }));
    const getDocs = firestore.getDocs as unknown as ReturnType<typeof vi.fn>;
    getDocs
      .mockResolvedValueOnce(makeSnap(all.slice(0, 3)))
      .mockResolvedValueOnce(makeSnap(all.slice(3, 6)))
      .mockResolvedValueOnce(makeSnap(all.slice(6, 7)));

    const result = await readAllDocsPaged({} as firestore.Query, pageSize);

    // One getDocs per page — proves reads are chunked, not one unbounded read.
    expect(getDocs).toHaveBeenCalledTimes(3);
    // Every doc is still visited and accumulated in order.
    expect(result.map((d) => (d as unknown as MockDoc).id)).toEqual(
      all.map((d) => d.id)
    );
    // Each page request is capped at the page size.
    expect(firestore.limit).toHaveBeenCalledWith(pageSize);
    // Pages after the first advance the cursor with startAfter.
    expect(firestore.startAfter).toHaveBeenCalledTimes(2);
  });

  it('terminates exactly when a full final page is followed by an empty page', async () => {
    const pageSize = 2;
    const all: MockDoc[] = [{ id: 'x' }, { id: 'y' }, { id: 'z' }, { id: 'w' }];
    const getDocs = firestore.getDocs as unknown as ReturnType<typeof vi.fn>;
    getDocs
      .mockResolvedValueOnce(makeSnap(all.slice(0, 2)))
      .mockResolvedValueOnce(makeSnap(all.slice(2, 4)))
      .mockResolvedValueOnce(makeSnap([]));

    const result = await readAllDocsPaged({} as firestore.Query, pageSize);

    expect(getDocs).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(4);
  });

  it('rejects a non-positive page size rather than looping forever', async () => {
    await expect(
      readAllDocsPaged({} as firestore.Query, 0)
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('defaults to FIRESTORE_PAGE_SIZE when no page size is supplied', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(makeSnap([{ id: 'only' }]));

    await readAllDocsPaged({} as firestore.Query);

    expect(firestore.limit).toHaveBeenCalledWith(FIRESTORE_PAGE_SIZE);
  });
});
