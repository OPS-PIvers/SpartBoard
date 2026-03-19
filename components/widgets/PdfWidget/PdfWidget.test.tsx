import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, Mock } from 'vitest';
import { PdfWidget } from './PdfWidget';
import { PdfSettings } from './Settings';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import * as firestore from 'firebase/firestore';
import { WidgetData } from '@/types';

// --- Module mocks ---

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useStorage');
vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));

const mockShowConfirm = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: mockShowConfirm,
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const result = [...arr];
    result.splice(to, 0, result.splice(from, 1)[0]);
    return result;
  }),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

// --- Fixtures ---

const mockUser = { uid: 'test-uid' };

const baseWidget: WidgetData = {
  id: 'widget-1',
  type: 'pdf',
  config: { activePdfId: null, activePdfUrl: null, activePdfName: null },
  w: 600,
  h: 750,
  x: 0,
  y: 0,
  z: 0,
  flipped: false,
};

const makePdf = (overrides: Record<string, unknown> = {}) => ({
  id: 'pdf-1',
  name: 'Lesson Plan.pdf',
  storagePath: 'https://drive.google.com/file/d/abc123/view',
  storageUrl: 'https://drive.google.com/file/d/abc123/preview',
  size: 512000,
  uploadedAt: 1000,
  order: 0,
  ...overrides,
});

// --- Helpers ---

const mockUpdateWidget = vi.fn();
const mockAddToast = vi.fn();
const mockUploadAndRegisterPdf = vi.fn();
const mockDeleteFile = vi.fn();

function setupMocks({
  pdfDocs = [] as ReturnType<typeof makePdf>[],
  uploading = false,
} = {}) {
  (useAuth as unknown as Mock).mockReturnValue({ user: mockUser });
  (useDashboard as unknown as Mock).mockReturnValue({
    updateWidget: mockUpdateWidget,
    addToast: mockAddToast,
  });
  (useStorage as unknown as Mock).mockReturnValue({
    uploadAndRegisterPdf: mockUploadAndRegisterPdf,
    deleteFile: mockDeleteFile,
    uploading,
  });

  (firestore.collection as unknown as Mock).mockReturnValue('collection-ref');
  (firestore.query as unknown as Mock).mockReturnValue('query-ref');
  (firestore.orderBy as unknown as Mock).mockReturnValue('orderby-ref');
  (firestore.doc as unknown as Mock).mockReturnValue('doc-ref');
  (firestore.writeBatch as unknown as Mock).mockReturnValue({
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  });

  (firestore.onSnapshot as unknown as Mock).mockImplementation(
    (_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
      cb({
        docs: pdfDocs.map((pdf) => ({ data: () => pdf, id: pdf.id })),
      });
      return vi.fn();
    }
  );
}

// --- Tests ---

describe('PdfWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockShowConfirm.mockResolvedValue(true);
  });

  it('renders library view with empty state when no PDFs exist', () => {
    setupMocks();
    render(<PdfWidget widget={baseWidget} />);

    expect(screen.getByText('PDF Library')).toBeInTheDocument();
    expect(screen.getByText('No PDFs yet')).toBeInTheDocument();
    expect(
      screen.getByText('Upload a PDF or drag one onto the board.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument();
  });

  it('renders library items with names and sizes', () => {
    setupMocks({
      pdfDocs: [
        makePdf({ id: 'pdf-1', name: 'Lesson Plan.pdf', size: 512000 }),
        makePdf({
          id: 'pdf-2',
          name: 'Homework.pdf',
          size: 1024 * 1024 * 2,
          order: 1,
        }),
      ],
    });
    render(<PdfWidget widget={baseWidget} />);

    expect(screen.getByText('Lesson Plan.pdf')).toBeInTheDocument();
    expect(screen.getByText('Homework.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 documents')).toBeInTheDocument();
  });

  it('shows singular document count for one PDF', () => {
    setupMocks({ pdfDocs: [makePdf()] });
    render(<PdfWidget widget={baseWidget} />);

    expect(screen.getByText('1 document')).toBeInTheDocument();
  });

  it('opens PDF viewer when Open button is clicked', () => {
    const pdf = makePdf();
    setupMocks({ pdfDocs: [pdf] });
    render(<PdfWidget widget={baseWidget} />);

    fireEvent.click(screen.getByTitle('Open PDF'));

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'widget-1',
      expect.objectContaining({
        config: expect.objectContaining({
          activePdfId: 'pdf-1',
          activePdfUrl: pdf.storageUrl,
          activePdfName: pdf.name,
        }) as unknown,
      }) as unknown
    );
  });

  it('renders viewer mode with iframe when activePdfUrl is set', () => {
    setupMocks();
    const viewerWidget: WidgetData = {
      ...baseWidget,
      config: {
        activePdfId: 'pdf-1',
        activePdfUrl: 'https://drive.google.com/file/d/abc123/preview',
        activePdfName: 'Lesson Plan.pdf',
      },
    };
    const { container } = render(<PdfWidget widget={viewerWidget} />);

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      'src',
      'https://drive.google.com/file/d/abc123/preview'
    );
    expect(screen.getByText('Lesson Plan.pdf')).toBeInTheDocument();
  });

  it('navigates back to library from viewer mode', () => {
    setupMocks();
    const viewerWidget: WidgetData = {
      ...baseWidget,
      config: {
        activePdfId: 'pdf-1',
        activePdfUrl: 'https://example.com/file.pdf',
        activePdfName: 'My Doc.pdf',
      },
    };
    render(<PdfWidget widget={viewerWidget} />);

    fireEvent.click(screen.getByTitle('Back to library'));

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'widget-1',
      expect.objectContaining({
        config: expect.objectContaining({
          activePdfId: null,
          activePdfUrl: null,
          activePdfName: null,
        }) as unknown,
      }) as unknown
    );
  });

  it('uploads a valid PDF and auto-opens it', async () => {
    setupMocks();
    const returnedPdf = {
      id: 'new-pdf',
      name: 'New File.pdf',
      storageUrl: 'https://example.com/new.pdf',
    };
    mockUploadAndRegisterPdf.mockResolvedValue(returnedPdf);

    const { container } = render(<PdfWidget widget={baseWidget} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const pdfFile = new File(['%PDF-1.4'], 'New File.pdf', {
      type: 'application/pdf',
    });

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [pdfFile] } });
    }

    await waitFor(() => {
      expect(mockUploadAndRegisterPdf).toHaveBeenCalledWith(
        'test-uid',
        pdfFile
      );
    });
    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'widget-1',
        expect.objectContaining({
          config: expect.objectContaining({
            activePdfId: 'new-pdf',
            activePdfName: 'New File.pdf',
          }) as unknown,
        }) as unknown
      );
    });
  });

  it('rejects a non-PDF file and shows error toast', () => {
    setupMocks();
    const { container } = render(<PdfWidget widget={baseWidget} />);
    const fileInput = container.querySelector('input[type="file"]');

    const imageFile = new File(['data'], 'photo.png', { type: 'image/png' });
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [imageFile] } });
    }

    expect(mockAddToast).toHaveBeenCalledWith(
      'Please upload a PDF file.',
      'error'
    );
    expect(mockUploadAndRegisterPdf).not.toHaveBeenCalled();
  });

  it('rejects an oversized PDF file and shows error toast', () => {
    setupMocks();
    const { container } = render(<PdfWidget widget={baseWidget} />);
    const fileInput = container.querySelector('input[type="file"]');

    const bigFile = new File(['x'.repeat(100)], 'huge.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(bigFile, 'size', {
      value: 51 * 1024 * 1024,
      writable: false,
    });
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [bigFile] } });
    }

    expect(mockAddToast).toHaveBeenCalledWith(
      'PDF is too large. Maximum size is 50MB.',
      'error'
    );
    expect(mockUploadAndRegisterPdf).not.toHaveBeenCalled();
  });

  it('deletes a PDF from Firestore and cleans up storage', async () => {
    const pdf = makePdf();
    setupMocks({ pdfDocs: [pdf] });
    (firestore.deleteDoc as unknown as Mock).mockResolvedValue(undefined);
    mockDeleteFile.mockResolvedValue(undefined);

    render(<PdfWidget widget={baseWidget} />);

    const deleteBtn = screen.getByTitle('Delete PDF');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(firestore.deleteDoc).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockDeleteFile).toHaveBeenCalledWith(pdf.storagePath);
    });
    expect(mockAddToast).toHaveBeenCalledWith('PDF removed', 'info');
  });

  it('cancels deletion when confirm is dismissed', async () => {
    setupMocks({ pdfDocs: [makePdf()] });
    mockShowConfirm.mockResolvedValueOnce(false);

    render(<PdfWidget widget={baseWidget} />);
    fireEvent.click(screen.getByTitle('Delete PDF'));

    await waitFor(() => {
      expect(firestore.deleteDoc).not.toHaveBeenCalled();
    });
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });
});

// --- Settings panel ---

describe('PdfSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
    });
  });

  it('shows "None" when no PDF is active', () => {
    render(<PdfSettings widget={baseWidget} />);
    expect(screen.getByText('None — library is shown')).toBeInTheDocument();
  });

  it('shows the active PDF name and a switch button', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: {
        activePdfId: 'pdf-1',
        activePdfUrl: 'https://example.com/file.pdf',
        activePdfName: 'Lesson Plan.pdf',
      },
    };
    render(<PdfSettings widget={widget} />);
    expect(screen.getByText('Lesson Plan.pdf')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Switch to Another PDF/i })
    ).toBeInTheDocument();
  });

  it('clears active PDF when "Switch to Another PDF" is clicked', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: {
        activePdfId: 'pdf-1',
        activePdfUrl: 'https://example.com/file.pdf',
        activePdfName: 'Lesson Plan.pdf',
      },
    };
    render(<PdfSettings widget={widget} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Switch to Another PDF/i })
    );

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'widget-1',
      expect.objectContaining({
        config: expect.objectContaining({
          activePdfId: null,
          activePdfUrl: null,
          activePdfName: null,
        }) as unknown,
      }) as unknown
    );
  });
});
