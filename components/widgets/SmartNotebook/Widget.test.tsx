import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, Mock } from 'vitest';
import React from 'react';
import { SmartNotebookWidget } from './Widget';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import * as firestore from 'firebase/firestore';
import * as parser from '@/utils/notebookParser';
import * as olf from '@/utils/olfConverter';
import { WidgetData } from '@/types';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

// Mock Modules
vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useStorage');
vi.mock('firebase/firestore');
vi.mock('@/utils/notebookParser');
vi.mock('@/utils/olfConverter', () => ({
  isOlfFile: (name: string) => /\.olf$/i.test(name),
  convertOlfToBundle: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({
  db: {},
}));

const boardItemMock = vi.hoisted(() => {
  const state: {
    status: 'off' | 'pending' | 'foreign' | 'none';
    item: { ownerUid: string; payload: unknown } | null;
  } = { status: 'off', item: null };
  return {
    shareId: null as string | null,
    state,
    published: [] as {
      itemId?: string | null;
      version?: string | null;
      build?: () => Promise<unknown>;
    }[],
  };
});
vi.mock('@/hooks/useSharedBoardItem', () => ({
  useSharedBoardItem: () => boardItemMock.state,
  useSharedBoardItemPublisher: (args: {
    itemId?: string | null;
    version?: string | null;
    build?: () => Promise<unknown>;
  }) => {
    boardItemMock.published.push(args);
  },
}));
vi.mock('@/context/dashboardCanvasStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/dashboardCanvasStore')>()),
  useActiveBoardLinkedShareId: () => boardItemMock.shareId,
}));

beforeEach(() => {
  boardItemMock.shareId = null;
  boardItemMock.state = { status: 'off', item: null };
  boardItemMock.published = [];
});

describe('SmartNotebookWidget', () => {
  const mockUpdateWidget = vi.fn();
  const mockAddToast = vi.fn();
  const mockUploadFile = vi.fn();

  const mockUser = { uid: 'test-uid' };
  const mockWidget = {
    id: 'widget-1',
    type: 'smartNotebook',
    config: { activeNotebookId: null, storageLimitMb: 50 },
    w: 600,
    h: 500,
    x: 0,
    y: 0,
    z: 0,
    flipped: false,
  } as WidgetData;

  beforeEach(() => {
    vi.resetAllMocks();

    (useAuth as unknown as Mock).mockReturnValue({ user: mockUser });
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
    });
    (useStorage as unknown as Mock).mockReturnValue({
      uploadFile: mockUploadFile,
    });

    // Mock Firestore
    // We need to mock onSnapshot to return some data or empty.
    (firestore.collection as unknown as Mock).mockReturnValue('collection-ref');
    (firestore.query as unknown as Mock).mockReturnValue('query-ref');
    (firestore.orderBy as unknown as Mock).mockReturnValue('orderby-ref');
    (firestore.doc as unknown as Mock).mockReturnValue('doc-ref');
  });

  it('renders library view by default', () => {
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({ docs: [] }); // Empty library
        return vi.fn(); // Unsubscribe
      }
    );

    render(<SmartNotebookWidget widget={mockWidget} />);

    expect(screen.getByText('Notebooks')).toBeInTheDocument();
    expect(screen.getByText('Library is empty')).toBeInTheDocument();
    // Use getAllByText because button and input might have similar text or just find by role
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument();
  });

  it('rejects files over the storage limit', async () => {
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({ docs: [] });
        return vi.fn();
      }
    );

    const limitedWidget = {
      ...mockWidget,
      config: { ...mockWidget.config, storageLimitMb: 1 }, // 1MB limit
    };

    const mockFile = new File(['dummy'], 'huge.notebook', {
      type: 'application/zip',
    });
    Object.defineProperty(mockFile, 'size', { value: 2 * 1024 * 1024 });

    const { container } = render(
      <SmartNotebookWidget widget={limitedWidget as WidgetData} />
    );

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      'File is too large (max 1MB)',
      'error'
    );
    expect(parser.parseNotebookFile).not.toHaveBeenCalled();
  });

  it('allows files when storage limit is 0 (no limit)', async () => {
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({ docs: [] });
        return vi.fn();
      }
    );

    const noLimitWidget = {
      ...mockWidget,
      config: { ...mockWidget.config, storageLimitMb: 0 },
    };

    const mockFile = new File(
      ['dummy'], // Mock file is small for testing parse, we mock property below
      'massive.notebook',
      { type: 'application/zip' }
    );
    Object.defineProperty(mockFile, 'size', { value: 100 * 1024 * 1024 });

    (parser.parseNotebookFile as unknown as Mock).mockResolvedValue({
      title: 'Test Notebook',
      pages: [],
      assets: [],
    });

    const { container } = render(
      <SmartNotebookWidget widget={noLimitWidget as WidgetData} />
    );

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.stringContaining('File is too large'),
      'error'
    );
    expect(parser.parseNotebookFile).toHaveBeenCalledWith(mockFile);
  });

  it('handles import flow with assets', async () => {
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({ docs: [] });
        return vi.fn();
      }
    );

    const mockFile = new File(['dummy'], 'test.notebook', {
      type: 'application/zip',
    });
    const mockPages = [
      { blob: new Blob(['page0'], { type: 'image/png' }), extension: 'png' },
    ];
    const mockAssets = [
      { blob: new Blob(['asset0'], { type: 'image/png' }), extension: 'png' },
    ];

    (parser.parseNotebookFile as unknown as Mock).mockResolvedValue({
      title: 'Test Notebook',
      pages: mockPages,
      assets: mockAssets,
    });
    mockUploadFile.mockResolvedValue('http://example.com/file.png');

    const { container } = render(<SmartNotebookWidget widget={mockWidget} />);

    // Find input by searching inside the container, as label/role might be tricky with hidden input
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    }

    await waitFor(() => {
      expect(parser.parseNotebookFile).toHaveBeenCalledWith(mockFile);
    });

    await waitFor(() => {
      // Upload called 2 times (1 page + 1 asset)
      expect(mockUploadFile).toHaveBeenCalledTimes(2);
    });

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Test Notebook',
        pageUrls: ['http://example.com/file.png'],
        assetUrls: ['http://example.com/file.png'],
      })
    );
    expect(mockUpdateWidget).toHaveBeenCalled(); // Auto-selects
  });

  it('opens an active notebook in edit mode by default', () => {
    // The editor fetches the current page's SVG on mount. Stub fetch so the
    // PageEditorOverlay can clear its loading state in tests; we don't need
    // the real SVG to run the geometry-free assertions below.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      })
    );

    const mockNotebook = {
      id: 'notebook-1',
      title: 'My Lesson',
      pageUrls: ['http://example.com/p1.svg', 'http://example.com/p2.svg'],
      createdAt: 123,
    };

    const activeWidget = {
      ...mockWidget,
      config: { activeNotebookId: 'notebook-1' },
    };

    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({
          docs: [
            {
              data: () => mockNotebook,
              id: 'notebook-1',
            },
          ],
        });
        return vi.fn();
      }
    );

    render(<SmartNotebookWidget widget={activeWidget} />);

    expect(screen.getByText('My Lesson')).toBeInTheDocument();
    // Editor header surfaces "Editing · Page N of M" instead of Viewer's "N/M"
    expect(screen.getByText(/Editing · Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByTitle('Switch to present mode')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('opens on the first visible page when page 0 is hidden', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      })
    );

    const mockNotebook = {
      id: 'notebook-1',
      title: 'My Lesson',
      pageUrls: ['http://example.com/p1.svg', 'http://example.com/p2.svg'],
      hiddenPages: [0],
      createdAt: 123,
    };

    const activeWidget = {
      ...mockWidget,
      config: { activeNotebookId: 'notebook-1' },
    };

    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({
          docs: [
            {
              data: () => mockNotebook,
              id: 'notebook-1',
            },
          ],
        });
        return vi.fn();
      }
    );

    render(<SmartNotebookWidget widget={activeWidget} />);

    expect(screen.getByText('My Lesson')).toBeInTheDocument();
    // Page 0 is hidden, so the widget should land on page index 1 (page 2).
    expect(screen.getByText(/Editing · Page 2 of 2/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('exposes the assets panel after switching to present mode', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      })
    );

    const mockNotebook = {
      id: 'notebook-1',
      title: 'My Lesson',
      pageUrls: ['http://example.com/p1.svg'],
      assetUrls: ['http://example.com/a1.png'],
      createdAt: 123,
    };

    const activeWidget = {
      ...mockWidget,
      config: { activeNotebookId: 'notebook-1' },
    };

    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({
          docs: [
            {
              data: () => mockNotebook,
              id: 'notebook-1',
            },
          ],
        });
        return vi.fn();
      }
    );

    render(<SmartNotebookWidget widget={activeWidget} />);

    // Notebook lands in the editor; flip to Present to reach the Viewer's
    // assets panel.
    fireEvent.click(screen.getByTitle('Switch to present mode'));

    const toggleBtn = screen.getByTitle('Toggle Assets');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByAltText('Asset 0')).toHaveAttribute(
      'src',
      'http://example.com/a1.png'
    );

    vi.unstubAllGlobals();
  });

  it('handles deletion of notebook and its storage assets', async () => {
    const mockNotebook = {
      id: 'notebook-1',
      title: 'To Delete',
      pageUrls: ['http://example.com/p1.png'],
      pagePaths: ['users/test-uid/notebooks/notebook-1/page0.png'],
      assetUrls: ['http://example.com/a1.png'],
      createdAt: 123,
    };

    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({
          docs: [
            {
              data: () => mockNotebook,
              id: 'notebook-1',
            },
          ],
        });
        return vi.fn();
      }
    );

    // Mock confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const mockDeleteFile = vi.fn().mockResolvedValue(undefined);
    (useStorage as unknown as Mock).mockReturnValue({
      uploadFile: vi.fn(),
      deleteFile: mockDeleteFile,
    });

    render(<SmartNotebookWidget widget={mockWidget} />);

    // The trash icon button
    // Actually, finding by class or icon might be better, but let's try to find the button in the card
    const deleteButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('svg.lucide-trash-2'));
    // Filter to ensure we get the actual button, not the parent div role="button"
    const actualDeleteBtn = deleteButtons.find(
      (btn) => btn.tagName === 'BUTTON'
    );
    if (!actualDeleteBtn) throw new Error('Delete button not found');
    fireEvent.click(actualDeleteBtn);

    await waitFor(() => {
      expect(mockDeleteFile).toHaveBeenCalledWith(
        'users/test-uid/notebooks/notebook-1/page0.png'
      );
      expect(mockDeleteFile).toHaveBeenCalledWith('http://example.com/a1.png');
    });

    expect(firestore.deleteDoc).toHaveBeenCalled();
  });

  it('converts a dropped-in .olf and reports the summary', async () => {
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_query: unknown, callback: (snapshot: { docs: unknown[] }) => void) => {
        callback({ docs: [] });
        return vi.fn();
      }
    );

    const mockFile = new File(['dummy'], 'Lesson.olf');
    (olf.convertOlfToBundle as unknown as Mock).mockResolvedValue({
      blob: new Blob(['bundle']),
      title: 'Lesson',
      pageCount: 2,
      hiddenPageCount: 1,
      skipped: { shape: 2 },
      warnings: [],
    });
    (parser.parseNotebookFile as unknown as Mock).mockResolvedValue({
      title: 'Lesson',
      pages: [
        { blob: new Blob(['p0'], { type: 'image/svg+xml' }), extension: 'svg' },
        { blob: new Blob(['p1'], { type: 'image/svg+xml' }), extension: 'svg' },
      ],
      assets: [],
      hiddenPages: [1],
    });
    mockUploadFile.mockResolvedValue('http://example.com/page.svg');

    const { container } = render(<SmartNotebookWidget widget={mockWidget} />);
    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(olf.convertOlfToBundle).toHaveBeenCalledWith(mockFile);
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'Imported 2 pages (1 hidden). Skipped 2 unsupported objects.',
        'success'
      );
    });
    expect(mockUpdateWidget).toHaveBeenCalled();
  });

  describe('inside a sub share', () => {
    const inShare = (load: () => Promise<unknown>) =>
      function InShare({ children }: { children: React.ReactNode }) {
        return (
          <SubShareContentContext.Provider
            value={subShareContextValue({
              shareId: 'share-1',
              version: 0,
              load: load,
              loadKey: noSubShareKey,
            })}
          >
            {children}
          </SubShareContentContext.Provider>
        );
      };

    const shared = {
      ...mockWidget,
      config: { activeNotebookId: 'nb-1', storageLimitMb: 50 },
    } as WidgetData;

    const bundled = {
      notebook: {
        id: 'nb-1',
        title: 'Fractions',
        pageUrls: ['https://storage/page1?token=a'],
        pagePaths: [],
        assetUrls: [],
        createdAt: 1,
      },
    };

    // The substitute is a different signed-in user: reading their own library
    // would show them an empty widget where the teacher's notebook belongs.
    it('shows the teacher’s bundled notebook, not the viewer’s library', async () => {
      const load = vi.fn().mockResolvedValue(bundled);

      render(<SmartNotebookWidget widget={shared} />, {
        wrapper: inShare(load),
      });

      expect(await screen.findByText('Fractions')).toBeInTheDocument();
      expect(screen.queryByText('Notebooks')).not.toBeInTheDocument();
      expect(firestore.onSnapshot).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledWith('notebook', 'nb-1');
    });

    // The editor autosaves page edits to the signed-in user's own notebook
    // doc, which for a substitute is a write to their account of the
    // teacher's pages. A share opens in the read-only view instead.
    it('opens read-only, with no editor and no page edits', async () => {
      render(<SmartNotebookWidget widget={shared} />, {
        wrapper: inShare(vi.fn().mockResolvedValue(bundled)),
      });

      expect(await screen.findByText('Fractions')).toBeInTheDocument();
      expect(
        screen.queryByTitle('Switch to present mode')
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle('Add blank page')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete page')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Drawing tool')).not.toBeInTheDocument();
    });

    // Closing flushes a pending page save to the signed-in user's notebook doc
    // and blanks the widget's notebook id, with no library to reopen from.
    it('has no close button, which would dead-end the widget', async () => {
      render(<SmartNotebookWidget widget={shared} />, {
        wrapper: inShare(vi.fn().mockResolvedValue(bundled)),
      });

      expect(await screen.findByText('Fractions')).toBeInTheDocument();
      expect(screen.queryByLabelText('Close notebook')).not.toBeInTheDocument();
    });

    // With no notebook chosen there is nothing to load, so the bundled-content
    // hook reads 'off' — the library must still stay away.
    it('shows nothing rather than the viewer’s library when no notebook is set', async () => {
      render(<SmartNotebookWidget widget={mockWidget} />, {
        wrapper: inShare(vi.fn()),
      });

      expect(await screen.findByText('No notebook')).toBeInTheDocument();
      expect(screen.queryByText('Library is empty')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Import/i })
      ).not.toBeInTheDocument();
    });

    // The teacher's board says which notebook to open. Treating it as stale
    // because the substitute does not own it would blank the widget.
    it('does not clear the teacher’s notebook id from the board', async () => {
      (firestore.onSnapshot as unknown as Mock).mockImplementation(
        (_q: unknown, cb: (s: { docs: unknown[] }) => void) => {
          cb({ docs: [{ id: 'other', data: () => ({ title: 'Theirs' }) }] });
          return vi.fn();
        }
      );

      render(<SmartNotebookWidget widget={shared} />, {
        wrapper: inShare(vi.fn().mockResolvedValue(bundled)),
      });

      expect(await screen.findByText('Fractions')).toBeInTheDocument();
      expect(mockUpdateWidget).not.toHaveBeenCalled();
    });
  });

  describe('on a Synced or View-Only board', () => {
    const onBoard = {
      ...mockWidget,
      config: { activeNotebookId: 'host-nb', storageLimitMb: 50 },
    } as WidgetData;
    const hostNotebook = {
      id: 'host-nb',
      title: 'Host fractions',
      pageUrls: ['https://storage/host1?token=a'],
      pagePaths: [],
      assetUrls: [],
      createdAt: 1,
    };
    const ownLibrary = (docs: { id: string; data: () => unknown }[]) =>
      (firestore.onSnapshot as unknown as Mock).mockImplementation(
        (_q: unknown, cb: (s: { docs: unknown[] }) => void) => {
          cb({ docs });
          return vi.fn();
        }
      );

    beforeEach(() => {
      boardItemMock.shareId = 'share-1';
    });

    it("shows another member's notebook read-only", () => {
      ownLibrary([]);
      boardItemMock.state = {
        status: 'foreign',
        item: { ownerUid: 'host-1', payload: { notebook: hostNotebook } },
      };
      render(<SmartNotebookWidget widget={onBoard} />);

      expect(screen.getByText('Host fractions')).toBeInTheDocument();
      expect(
        screen.queryByTitle('Switch to present mode')
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Close notebook')).not.toBeInTheDocument();
      expect(screen.queryByText('Notebooks')).not.toBeInTheDocument();
    });

    // A colleague's library never holds the owner's notebook, so treating it
    // as deleted would close it for everyone on the board.
    it("does not clear a notebook the viewer doesn't own", () => {
      ownLibrary([{ id: 'other', data: () => ({ title: 'Mine' }) }]);
      boardItemMock.state = { status: 'none', item: null };
      render(<SmartNotebookWidget widget={onBoard} />);

      expect(mockUpdateWidget).not.toHaveBeenCalled();
    });

    it("publishes the owner's open notebook without its Storage paths", async () => {
      ownLibrary([
        {
          id: 'host-nb',
          data: () => ({ ...hostNotebook, pagePaths: ['users/x/page0.svg'] }),
        },
      ]);
      render(<SmartNotebookWidget widget={onBoard} />);

      const last = boardItemMock.published.at(-1);
      expect(last).toMatchObject({
        itemId: 'host-nb',
        version: expect.any(String) as unknown,
      });
      await expect(last?.build?.()).resolves.toMatchObject({
        notebook: { id: 'host-nb', pagePaths: [] },
      });
    });
  });
});
