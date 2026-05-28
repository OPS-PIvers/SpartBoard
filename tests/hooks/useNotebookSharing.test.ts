/**
 * Regression tests for useNotebookSharing.
 *
 * Verifies that `objectLinks` (object-to-page hyperlinks authored by the
 * original teacher) survive the share → import roundtrip. Earlier versions
 * dropped the field from both the `SharedNotebook` payload and the imported
 * `NotebookItem`, so a teacher who imported a shared notebook lost every
 * page-link hotspot the author had set up.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { NotebookItem, NotebookObjectLink } from '@/types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore', () => {
  const docs = new Map<string, unknown>();
  let nextShareId = 0;
  return {
    addDoc: vi.fn((ref: { path: string }, data: unknown) => {
      nextShareId += 1;
      const id = `share-${nextShareId}`;
      docs.set(`${ref.path}/${id}`, data);
      return Promise.resolve({ id });
    }),
    setDoc: vi.fn((ref: { path: string }, data: unknown) => {
      docs.set(ref.path, data);
      return Promise.resolve(undefined);
    }),
    getDoc: vi.fn((ref: { path: string }) =>
      Promise.resolve({
        exists: () => docs.has(ref.path),
        data: () => docs.get(ref.path),
      })
    ),
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    __testHelpers: {
      docs,
      reset: () => {
        docs.clear();
        nextShareId = 0;
      },
    },
  };
});

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'importer-uid' } })),
}));

// `uploadFile` round-trips the same bytes (matching real Storage behavior).
// We return a fake download URL derived from the path so the test can assert
// the import wrote new URLs without caring about the bytes themselves.
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploadFile: vi.fn((path: string) =>
      Promise.resolve(`https://storage.test/${path}?token=copy`)
    ),
    deleteFile: vi.fn(() => Promise.resolve(undefined)),
  }),
}));

// Stub `window.location.origin` so `shareNotebook`'s returned URL is
// deterministic on jsdom.
Object.defineProperty(window, 'location', {
  value: { origin: 'https://spartboard.test' },
  writable: true,
});

// `fetch` is hit once per page/asset URL during import. Return a tiny
// well-typed blob — bytes don't matter for this test.
const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    blob: () =>
      Promise.resolve(
        new Blob([new Uint8Array([0])], { type: 'image/svg+xml' })
      ),
  } as unknown as Response)
);
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Imports after mocks are hoisted
// ---------------------------------------------------------------------------

import * as firestore from 'firebase/firestore';
import { useNotebookSharing } from '@/hooks/useNotebookSharing';

const firestoreHelpers = (
  firestore as unknown as {
    __testHelpers: { docs: Map<string, unknown>; reset: () => void };
  }
).__testHelpers;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OBJECT_LINKS: NotebookObjectLink[] = [
  {
    id: 'link-1',
    objectId: 'svg-obj-abc',
    sourcePage: 0,
    targetPage: 2,
    xFrac: 0.1,
    yFrac: 0.2,
    wFrac: 0.3,
    hFrac: 0.4,
  },
  {
    id: 'link-2',
    objectId: 'svg-obj-def',
    sourcePage: 1,
    targetPage: 0,
    xFrac: 0.5,
    yFrac: 0.5,
    wFrac: 0.2,
    hFrac: 0.2,
  },
];

const NOTEBOOK_WITH_LINKS: NotebookItem = {
  id: 'src-notebook',
  title: 'Lesson with hotspots',
  pageUrls: [
    'https://storage.test/users/author/notebooks/src/page0.svg?token=a',
    'https://storage.test/users/author/notebooks/src/page1.svg?token=a',
    'https://storage.test/users/author/notebooks/src/page2.svg?token=a',
  ],
  pagePaths: [
    'users/author/notebooks/src/page0.svg',
    'users/author/notebooks/src/page1.svg',
    'users/author/notebooks/src/page2.svg',
  ],
  assetUrls: [],
  createdAt: 1700000000000,
  objectLinks: OBJECT_LINKS,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  firestoreHelpers.reset();
  fetchMock.mockClear();
});

describe('useNotebookSharing — objectLinks roundtrip', () => {
  it('shareNotebook persists objectLinks on the shared_notebooks doc', async () => {
    const { result } = renderHook(() => useNotebookSharing());

    let shareUrl = '';
    await act(async () => {
      shareUrl = await result.current.shareNotebook(NOTEBOOK_WITH_LINKS);
    });

    expect(shareUrl).toMatch(
      /^https:\/\/spartboard\.test\/share\/notebook\/share-1$/
    );
    const sharedDoc = firestoreHelpers.docs.get('shared_notebooks/share-1') as
      | { objectLinks?: NotebookObjectLink[] }
      | undefined;
    expect(sharedDoc?.objectLinks).toEqual(OBJECT_LINKS);
  });

  it('importSharedNotebookCopy carries objectLinks onto the imported NotebookItem', async () => {
    const { result } = renderHook(() => useNotebookSharing());

    await act(async () => {
      await result.current.shareNotebook(NOTEBOOK_WITH_LINKS);
    });

    let importedId = '';
    await act(async () => {
      importedId = await result.current.importSharedNotebookCopy('share-1');
    });

    const imported = firestoreHelpers.docs.get(
      `users/importer-uid/notebooks/${importedId}`
    ) as NotebookItem | undefined;

    expect(imported).toBeDefined();
    expect(imported?.objectLinks).toEqual(OBJECT_LINKS);
    // Page count is preserved → sourcePage/targetPage indices stay in range.
    expect(imported?.pageUrls).toHaveLength(
      NOTEBOOK_WITH_LINKS.pageUrls.length
    );
  });

  it('omits objectLinks from the payload when the source notebook has none (Firestore rejects undefined)', async () => {
    const { result } = renderHook(() => useNotebookSharing());
    const { objectLinks: _drop, ...noLinks } = NOTEBOOK_WITH_LINKS;
    void _drop;

    await act(async () => {
      await result.current.shareNotebook(noLinks);
    });

    const sharedDoc = firestoreHelpers.docs.get('shared_notebooks/share-1') as
      | Record<string, unknown>
      | undefined;
    expect(sharedDoc).toBeDefined();
    expect('objectLinks' in (sharedDoc as Record<string, unknown>)).toBe(false);
  });
});
