import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IconOrImageInput } from './IconOrImageInput';

const flags = { picker: true };
const uploadSticker = vi.fn();
const deleteFile = vi.fn();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessFeature: (id: string) =>
      id === 'unified-image-picker' && flags.picker,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadSticker, deleteFile }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn(), isConnected: true }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

const png = () => new File(['x'], 'a.png', { type: 'image/png' });
const props = { widgetId: 'w1', widgetType: 'stations', fieldKey: 's1' };

describe('Stations IconOrImageInput image tab', () => {
  beforeEach(() => {
    flags.picker = true;
    uploadSticker.mockReset();
    deleteFile.mockReset().mockResolvedValue(undefined);
  });

  it('shows the shared picker with the Stations anchors when the flag is on', () => {
    render(
      <IconOrImageInput {...props} imageUrl={undefined} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Image'));
    const upload = screen.getByRole('button', { name: 'Upload' });
    expect(upload.getAttribute('data-tour')).toBe(
      'widget-settings.stations.upload-image'
    );
    expect(upload.getAttribute('data-tour-widget')).toBe('w1');
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image link' })).toBeTruthy();
  });

  it('saves to Drive through uploadSticker and trashes the replaced image', async () => {
    uploadSticker.mockResolvedValue('https://lh3.googleusercontent.com/d/new');
    const onChange = vi.fn();
    const { container } = render(
      <IconOrImageInput
        {...props}
        imageUrl="https://lh3.googleusercontent.com/d/old"
        onChange={onChange}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        iconName: undefined,
        imageUrl: 'https://lh3.googleusercontent.com/d/new',
      })
    );
    expect(uploadSticker).toHaveBeenCalledWith('u1', expect.any(File));
    await waitFor(() =>
      expect(deleteFile).toHaveBeenCalledWith(
        'https://lh3.googleusercontent.com/d/old'
      )
    );
  });

  it('keeps the old upload box when the flag is off', () => {
    flags.picker = false;
    render(
      <IconOrImageInput {...props} imageUrl={undefined} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Image'));
    expect(screen.getByText('Upload or paste image')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Google Drive' })).toBeNull();
  });

  it('gives a paste to the station it lands in, not the first one in the drawer', async () => {
    uploadSticker.mockResolvedValue('https://lh3.googleusercontent.com/d/new');
    const first = vi.fn();
    const second = vi.fn();
    render(
      <div role="dialog">
        <IconOrImageInput
          {...props}
          fieldKey="s1"
          imageUrl="https://lh3.googleusercontent.com/d/one"
          onChange={first}
        />
        <IconOrImageInput
          {...props}
          fieldKey="s2"
          imageUrl="https://lh3.googleusercontent.com/d/two"
          onChange={second}
        />
      </div>
    );
    const target = screen.getAllByRole('button', { name: 'Upload' })[1];
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [png()], types: ['Files'] },
    });
    target.dispatchEvent(event);
    await waitFor(() => expect(second).toHaveBeenCalled());
    expect(first).not.toHaveBeenCalled();
    expect(uploadSticker).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(deleteFile).toHaveBeenCalledWith(
        'https://lh3.googleusercontent.com/d/two'
      )
    );
    expect(deleteFile).not.toHaveBeenCalledWith(
      'https://lh3.googleusercontent.com/d/one'
    );
  });
});
