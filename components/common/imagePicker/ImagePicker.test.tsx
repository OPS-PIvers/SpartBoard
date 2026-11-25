import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImagePicker } from './ImagePicker';

const openPicker = vi.fn();
const getDriveFileAsBlob = vi.fn();
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker, isConnected: true }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob }),
}));

const png = (name = 'cat.png') => new File(['x'], name, { type: 'image/png' });
const scope = { type: 'url', field: 'background' };

describe('ImagePicker', () => {
  beforeEach(() => {
    openPicker.mockReset();
    getDriveFileAsBlob.mockReset();
  });

  it('offers every source in the empty field', () => {
    render(
      <ImagePicker tourScope={scope} upload={vi.fn()} onChange={vi.fn()} />
    );
    expect(screen.getByText('Drop or paste an image')).toBeTruthy();
    for (const name of ['Upload', 'Google Drive', 'Image link']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(
      screen.getByRole('button', { name: 'Upload' }).getAttribute('data-tour')
    ).toBe('image-picker.upload');
  });

  it('uploads a chosen file and reports its URL', async () => {
    const upload = vi.fn().mockResolvedValue('https://saved/1');
    const onChange = vi.fn();
    const { container } = render(
      <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('https://saved/1')
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('takes a dropped image', async () => {
    const upload = vi.fn().mockResolvedValue('https://saved/2');
    const onChange = vi.fn();
    render(
      <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
    );
    const zone = screen.getByText('Drop or paste an image')
      .parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [png()] },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('https://saved/2')
    );
  });

  it('refuses a file that is not an image', async () => {
    const upload = vi.fn();
    const { container } = render(
      <ImagePicker tourScope={scope} upload={upload} onChange={vi.fn()} />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })],
      },
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps an https image link as a link', async () => {
    const upload = vi.fn();
    const onChange = vi.fn();
    render(
      <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
    fireEvent.change(screen.getByLabelText('Image link'), {
      target: { value: 'https://example.org/a.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('https://example.org/a.png')
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a link that is not https', async () => {
    const onChange = vi.fn();
    render(
      <ImagePicker tourScope={scope} upload={vi.fn()} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
    fireEvent.change(screen.getByLabelText('Image link'), {
      target: { value: 'http://example.org/a.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/https/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sends a link to a saved app file to the Drive button', async () => {
    const onChange = vi.fn();
    render(
      <ImagePicker tourScope={scope} upload={vi.fn()} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
    fireEvent.change(screen.getByLabelText('Image link'), {
      target: { value: 'https://lh3.googleusercontent.com/d/abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Google Drive/
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a plain line when an upload fails', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('storage/unauthorized'));
    const { container } = render(
      <ImagePicker tourScope={scope} upload={upload} onChange={vi.fn()} />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    expect((await screen.findByRole('alert')).textContent).toBe(
      "The image didn't add."
    );
  });

  it('saves a Drive pick through the caller upload', async () => {
    openPicker.mockResolvedValue({ id: 'd1' });
    getDriveFileAsBlob.mockResolvedValue({
      blob: new Blob(['x'], { type: 'image/png' }),
      mimeType: 'image/png',
      name: 'pic.png',
    });
    const upload = vi.fn().mockResolvedValue('https://saved/3');
    const onChange = vi.fn();
    render(
      <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('https://saved/3')
    );
    expect(openPicker).toHaveBeenCalledWith({ mode: 'images' });
    expect((upload.mock.calls[0][0] as File).name).toBe('pic.png');
  });

  it('holds a Drive pick to the size limit', async () => {
    openPicker.mockResolvedValue({ id: 'd2' });
    getDriveFileAsBlob.mockResolvedValue({
      blob: new Blob(['x'.repeat(2048)], { type: 'image/png' }),
      mimeType: 'image/png',
      name: 'big.png',
    });
    const upload = vi.fn();
    render(
      <ImagePicker
        tourScope={scope}
        upload={upload}
        onChange={vi.fn()}
        maxBytes={1024}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/too large/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows the image with Remove once one is set', () => {
    const onRemove = vi.fn();
    render(
      <ImagePicker
        tourScope={scope}
        value="https://saved/4"
        upload={vi.fn()}
        onChange={vi.fn()}
        onRemove={onRemove}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onRemove).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
  });

  it('opens the same sources from the small button', () => {
    render(
      <ImagePicker
        layout="button"
        label="Add image to Term"
        tourScope={scope}
        upload={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add image to Term' }));
    expect(
      screen.getByRole('dialog', { name: 'Add image to Term' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeTruthy();
  });
});

describe('ImagePicker button content', () => {
  it('shows the caller content in place of the icon', () => {
    render(
      <ImagePicker
        layout="button"
        label="Upload"
        tourScope={scope}
        upload={vi.fn()}
        onChange={vi.fn()}
        buttonContent={(busy) => <span>{busy ? 'Wait' : 'Upload now'}</span>}
      />
    );
    expect(screen.getByRole('button', { name: 'Upload' }).textContent).toBe(
      'Upload now'
    );
  });
});
