import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StickerBookWidget } from './StickerBookWidget';
import type { WidgetData } from '@/types';

const flags = { picker: true };
const updateWidget = vi.fn();
const processAndUploadImage = vi.fn();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    featurePermissions: [],
    userGradeLevels: [],
    canAccessFeature: (id: string) =>
      id === 'unified-image-picker' && flags.picker,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget,
    clearAllStickers: vi.fn(),
    addWidget: vi.fn(),
    addToast: vi.fn(),
  }),
}));
vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({ processAndUploadImage, uploading: false }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn(), isConnected: true }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

const widget = {
  id: 'sb1',
  type: 'stickers',
  x: 0,
  y: 0,
  w: 400,
  h: 500,
  z: 1,
  flipped: false,
  config: { uploadedUrls: ['https://saved/old'] },
} as unknown as WidgetData;

const png = () => new File(['x'], 'a.png', { type: 'image/png' });

describe('Sticker Book upload', () => {
  beforeEach(() => {
    flags.picker = true;
    updateWidget.mockReset();
    processAndUploadImage.mockReset();
  });

  it('opens the shared picker from the Upload button and keeps its anchor', () => {
    render(<StickerBookWidget widget={widget} />);
    const open = screen.getAllByRole('button', { name: 'Upload' })[0];
    expect(open.getAttribute('data-tour')).toBe('stickers.upload');
    fireEvent.click(open);
    const panel = screen.getByRole('dialog', { name: 'Upload' });
    expect(panel.textContent).toContain('Google Drive');
    expect(panel.textContent).toContain('Image link');
  });

  it('opens the shared picker from the drop zone and keeps its anchor', () => {
    const { container } = render(<StickerBookWidget widget={widget} />);
    const zone = container.querySelector(
      '[data-tour="stickers.upload-zone"]'
    ) as HTMLElement;
    expect(zone.tagName).toBe('BUTTON');
    fireEvent.click(zone);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('adds a dropped image as a custom sticker through the same upload', async () => {
    processAndUploadImage.mockResolvedValue('https://saved/new');
    // The board's own drop handler must not also take the file.
    const boardDrop = vi.fn();
    const { container } = render(
      <div onDrop={boardDrop}>
        <StickerBookWidget widget={widget} />
      </div>
    );
    const zone = container.querySelector(
      '[data-tour="stickers.upload-zone"]'
    ) as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [png()] },
    });
    await waitFor(() =>
      expect(updateWidget).toHaveBeenCalledWith('sb1', {
        config: { uploadedUrls: ['https://saved/old', 'https://saved/new'] },
      })
    );
    expect(processAndUploadImage).toHaveBeenCalledTimes(1);
    expect(boardDrop).not.toHaveBeenCalled();
  });

  it('shows an error line when the upload gives nothing back', async () => {
    processAndUploadImage.mockResolvedValue(null);
    const { container } = render(<StickerBookWidget widget={widget} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Upload' })[0]);
    const input = container.ownerDocument.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('keeps the old upload label when the flag is off', () => {
    flags.picker = false;
    const { container } = render(<StickerBookWidget widget={widget} />);
    const label = container.querySelector('[data-tour="stickers.upload"]');
    expect(label?.tagName).toBe('LABEL');
    expect(
      container.querySelector('[data-tour="stickers.upload-zone"]')?.tagName
    ).toBe('DIV');
  });
});
