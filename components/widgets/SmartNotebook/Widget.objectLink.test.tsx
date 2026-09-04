import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, Mock } from 'vitest';
import { SmartNotebookWidget } from './Widget';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import * as firestore from 'firebase/firestore';
import { WidgetData, NotebookObjectLink } from '@/types';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useStorage');
vi.mock('firebase/firestore');
vi.mock('@/utils/notebookParser');
vi.mock('@/config/firebase', () => ({
  db: {},
}));

// Replaced with a minimal stub exposing two buttons that call the same
// onSaveObjectLink prop the real overlay's LinkTargetPicker uses, so the
// test can drive the two-writes-for-the-same-pair race directly instead of
// simulating SVG hotspot selection through the full page editor.
vi.mock('./components/PageEditorOverlay', () => ({
  PageEditorOverlay: (props: {
    onSaveObjectLink?: (link: NotebookObjectLink) => void;
    onRemoveObjectLink?: (linkId: string) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          props.onSaveObjectLink?.({
            id: 'link-1',
            objectId: 'obj-1',
            sourcePage: 0,
            targetPage: 1,
            xFrac: 0,
            yFrac: 0,
            wFrac: 0.1,
            hFrac: 0.1,
          })
        }
      >
        link-to-page-1
      </button>
      <button
        onClick={() =>
          props.onSaveObjectLink?.({
            id: 'link-1',
            objectId: 'obj-1',
            sourcePage: 0,
            targetPage: 2,
            xFrac: 0,
            yFrac: 0,
            wFrac: 0.1,
            hFrac: 0.1,
          })
        }
      >
        link-to-page-2
      </button>
      <button onClick={() => props.onRemoveObjectLink?.('link-1')}>
        remove-link-1
      </button>
    </div>
  ),
}));

describe('SmartNotebookWidget object link concurrency', () => {
  const mockUser = { uid: 'test-uid' };
  const mockWidget = {
    id: 'widget-1',
    type: 'smartNotebook',
    config: { activeNotebookId: 'notebook-1' },
    w: 600,
    h: 500,
    x: 0,
    y: 0,
    z: 0,
    flipped: false,
  } as WidgetData;

  // Stands in for the actual Firestore document. Only handleSaveObjectLink's
  // own writes touch it — the component's React state (fed by onSnapshot,
  // fired once below) never refreshes from it, matching a second browser
  // tab, or a save issued before the first save's snapshot lands.
  let serverObjectLinks: NotebookObjectLink[];

  const deepEqual = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

  beforeEach(() => {
    vi.resetAllMocks();

    serverObjectLinks = [
      {
        id: 'link-1',
        objectId: 'obj-1',
        sourcePage: 0,
        targetPage: 0,
        xFrac: 0,
        yFrac: 0,
        wFrac: 0.1,
        hFrac: 0.1,
      },
    ];

    (useAuth as unknown as Mock).mockReturnValue({ user: mockUser });
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: vi.fn(),
      addToast: vi.fn(),
    });
    (useStorage as unknown as Mock).mockReturnValue({ uploadFile: vi.fn() });

    (firestore.collection as unknown as Mock).mockReturnValue('collection-ref');
    (firestore.query as unknown as Mock).mockReturnValue('query-ref');
    (firestore.orderBy as unknown as Mock).mockReturnValue('orderby-ref');
    (firestore.doc as unknown as Mock).mockReturnValue('doc-ref');

    const initialNotebook = {
      id: 'notebook-1',
      title: 'My Lesson',
      pageUrls: ['http://example.com/p1.svg', 'http://example.com/p2.svg'],
      createdAt: 123,
      objectLinks: serverObjectLinks,
    };
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({ docs: [{ data: () => initialNotebook, id: 'notebook-1' }] });
        return vi.fn();
      }
    );

    // Real Firestore semantics for the two field-transform sentinels, applied
    // against the shared "server" array.
    (firestore.arrayRemove as unknown as Mock).mockImplementation(
      (...values: unknown[]) => ({ __op: 'remove', values })
    );
    (firestore.arrayUnion as unknown as Mock).mockImplementation(
      (...values: unknown[]) => ({ __op: 'union', values })
    );
    (firestore.updateDoc as unknown as Mock).mockImplementation(
      (_ref: unknown, data: { objectLinks?: unknown }) => {
        const op = data.objectLinks as
          | { __op: 'remove' | 'union'; values: NotebookObjectLink[] }
          | undefined;
        if (!op) return;
        if (op.__op === 'remove') {
          serverObjectLinks = serverObjectLinks.filter(
            (l) => !op.values.some((v) => deepEqual(v, l))
          );
        } else {
          for (const v of op.values) {
            if (!serverObjectLinks.some((l) => deepEqual(l, v))) {
              serverObjectLinks = [...serverObjectLinks, v];
            }
          }
        }
      }
    );
    (firestore.getDoc as unknown as Mock).mockImplementation(() => ({
      exists: () => true,
      data: () => ({ objectLinks: serverObjectLinks }),
    }));
    (firestore.runTransaction as unknown as Mock).mockImplementation(
      async (
        _db: unknown,
        updateFn: (tx: {
          get: (ref: unknown) => Promise<{
            exists: () => boolean;
            data: () => { objectLinks: NotebookObjectLink[] };
          }>;
          update: (ref: unknown, data: { objectLinks: unknown }) => void;
        }) => Promise<void>
      ) => {
        const tx = {
          get: () =>
            Promise.resolve({
              exists: () => true,
              data: () => ({ objectLinks: serverObjectLinks }),
            }),
          update: (_ref: unknown, data: { objectLinks: unknown }) => {
            serverObjectLinks = data.objectLinks as NotebookObjectLink[];
          },
        };
        await updateFn(tx);
      }
    );
  });

  it('does not duplicate a hotspot when the same object/page pair is re-linked before the snapshot refreshes', async () => {
    render(<SmartNotebookWidget widget={mockWidget} />);

    await act(async () => {
      fireEvent.click(screen.getByText('link-to-page-1'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('link-to-page-2'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const linksForPair = serverObjectLinks.filter(
      (l) => l.objectId === 'obj-1' && l.sourcePage === 0
    );
    expect(linksForPair).toHaveLength(1);
    expect(linksForPair[0].targetPage).toBe(2);
  });

  it('removes a link by id even when its fields changed server-side after this session’s snapshot', async () => {
    render(<SmartNotebookWidget widget={mockWidget} />);

    // A concurrent writer (another tab/session) already changed link-1's
    // fields server-side; this component's local snapshot still holds the
    // original fields from the initial onSnapshot fired in beforeEach.
    serverObjectLinks = [
      { ...serverObjectLinks[0], targetPage: 5 },
      {
        id: 'link-2',
        objectId: 'obj-2',
        sourcePage: 1,
        targetPage: 0,
        xFrac: 0,
        yFrac: 0,
        wFrac: 0.1,
        hFrac: 0.1,
      },
    ];

    await act(async () => {
      fireEvent.click(screen.getByText('remove-link-1'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(serverObjectLinks.find((l) => l.id === 'link-1')).toBeUndefined();
    expect(serverObjectLinks).toHaveLength(1);
    expect(serverObjectLinks[0].id).toBe('link-2');
  });
});
