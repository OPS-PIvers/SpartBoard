import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { HotspotImageConfig, WidgetData } from '@/types';

const mockUploadHotspotImage =
  vi.fn<(uid: string, file: File) => Promise<string>>();
const mockDeleteFile = vi.fn();
const flags = { unified: true };

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    savedWidgetPresets: {},
    saveWidgetPreset: vi.fn(),
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(), showPrompt: vi.fn() }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploadHotspotImage: mockUploadHotspotImage,
    deleteFile: mockDeleteFile,
    uploading: false,
  }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn() }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

import { HotspotImageBaseField } from './settingsFields';

const widget = { id: 'hs-1', type: 'hotspot-image' } as unknown as WidgetData;

const makeCtx = (config: Partial<HotspotImageConfig>, updateConfig = vi.fn()) =>
  ({
    config,
    widget,
    canAccessFeature: (id: string) =>
      id === 'unified-image-picker' && flags.unified,
    t: (key: string) => key.replace('widgetSettings.hotspot-image.', ''),
    surface: 'drawer',
    updateConfig,
    id: 'hs-field',
    labelId: 'hs-field-label',
  }) as unknown as CustomRenderCtx;

const fileInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>(
    'input[type="file"]'
  ) as HTMLInputElement;

beforeEach(() => {
  flags.unified = true;
  mockUploadHotspotImage.mockReset();
  mockDeleteFile.mockReset();
});

describe('Hotspot Image base image field', () => {
  it('keeps the old upload button with the flag off', () => {
    flags.unified = false;
    render(<HotspotImageBaseField ctx={makeCtx({})} />);
    expect(screen.getByRole('button', { name: 'uploadImage' })).toHaveAttribute(
      'data-tour',
      'widget-settings.hotspot-image.upload'
    );
    expect(screen.queryByRole('button', { name: /Google Drive/ })).toBeNull();
  });

  it('shows the shared picker and keeps the upload tour anchor', () => {
    render(<HotspotImageBaseField ctx={makeCtx({})} />);
    const upload = screen.getByRole('button', { name: /Upload/ });
    expect(upload).toHaveAttribute(
      'data-tour',
      'widget-settings.hotspot-image.upload'
    );
    expect(upload).toHaveAttribute('data-tour-widget', 'hs-1');
    expect(
      screen.getByRole('button', { name: /Google Drive/ })
    ).toHaveAttribute('data-tour-field', 'baseImageUrl');
  });

  it('saves an upload to Drive through the same helper and keeps the old image', async () => {
    mockUploadHotspotImage.mockResolvedValue('https://example.com/new.png');
    const updateConfig = vi.fn();
    const { container } = render(
      <HotspotImageBaseField
        ctx={makeCtx(
          { baseImageUrl: 'https://example.com/old.png' },
          updateConfig
        )}
      />
    );
    const file = new File(['x'], 'map.png', { type: 'image/png' });
    fireEvent.change(fileInput(container), { target: { files: [file] } });
    await waitFor(() =>
      expect(updateConfig).toHaveBeenCalledWith({
        baseImageUrl: 'https://example.com/new.png',
      })
    );
    expect(mockUploadHotspotImage).toHaveBeenCalledWith('u1', file);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('keeps the 10 MB cap', async () => {
    const { container } = render(<HotspotImageBaseField ctx={makeCtx({})} />);
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(fileInput(container), { target: { files: [big] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('10 MB');
    expect(mockUploadHotspotImage).not.toHaveBeenCalled();
  });

  it('ignores a paste outside the picker so pins keep their image', () => {
    render(
      <div role="dialog">
        <button type="button">elsewhere</button>
        <HotspotImageBaseField ctx={makeCtx({})} />
      </div>
    );
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [file], types: ['Files'] },
    });
    screen.getByRole('button', { name: 'elsewhere' }).dispatchEvent(paste);
    expect(mockUploadHotspotImage).not.toHaveBeenCalled();
  });
});
