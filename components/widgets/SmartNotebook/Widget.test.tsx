import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, Mock } from 'vitest';
import { SmartNotebookWidget } from './Widget';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import * as firestore from 'firebase/firestore';
import * as parser from '@/utils/notebookParser';
import { WidgetData } from '@/types';

// Mock Modules
vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useStorage');
vi.mock('firebase/firestore');
vi.mock('@/utils/notebookParser');
vi.mock('@/config/firebase', () => ({
  db: {},
}));

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

  it('displays active notebook', () => {
    const mockNotebook = {
      id: 'notebook-1',
      title: 'My Lesson',
      pageUrls: ['http://example.com/p1.png', 'http://example.com/p2.png'],
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
    expect(screen.getAllByText('1 / 2')[0]).toBeInTheDocument();
    expect(screen.getByAltText('Page 1')).toHaveAttribute(
      'src',
      'http://example.com/p1.png'
    );
  });

  it('toggles assets panel', () => {
    const mockNotebook = {
      id: 'notebook-1',
      title: 'My Lesson',
      pageUrls: ['http://example.com/p1.png'],
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

    const toggleBtn = screen.getByTitle('Toggle Assets');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByAltText('Asset 0')).toHaveAttribute(
      'src',
      'http://example.com/a1.png'
    );
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
      .filter((btn) => btn.querySelector('svg.lucide-trash2'));
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
});
