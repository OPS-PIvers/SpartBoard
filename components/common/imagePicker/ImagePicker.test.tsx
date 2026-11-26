import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';
import { ImagePicker, type ImagePickerHandle } from './ImagePicker';

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

  it('adds each of several files when multiple is on, past one that fails', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce('https://saved/a')
      .mockResolvedValueOnce('https://saved/c');
    const onChange = vi.fn();
    const { container } = render(
      <ImagePicker
        multiple
        maxBytes={2}
        tourScope={scope}
        upload={upload}
        onChange={onChange}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const big = new File(['xxxx'], 'big.png', { type: 'image/png' });
    fireEvent.change(input, {
      target: { files: [png('a.png'), big, png('c.png')] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenNthCalledWith(1, 'https://saved/a');
    expect(onChange).toHaveBeenNthCalledWith(2, 'https://saved/c');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'too large'
    );
  });

  it('takes only the first file when multiple is off', async () => {
    const upload = vi.fn().mockResolvedValue('https://saved/1');
    const onChange = vi.fn();
    const { container } = render(
      <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.multiple).toBe(false);
    fireEvent.change(input, {
      target: { files: [png('a.png'), png('b.png')] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
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

  it('saves every file when multiple is on and keeps the first problem', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce('https://saved/a')
      .mockResolvedValueOnce('https://saved/c');
    const onChange = vi.fn();
    const { container } = render(
      <ImagePicker
        tourScope={scope}
        upload={upload}
        onChange={onChange}
        multiple
        maxBytes={5}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const big = new File(['123456789'], 'big.png', { type: 'image/png' });
    fireEvent.change(input, {
      target: { files: [png('a.png'), big, png('c.png')] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenNthCalledWith(1, 'https://saved/a');
    expect(onChange).toHaveBeenNthCalledWith(2, 'https://saved/c');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'too large'
    );
  });

  it('reports batch counts instead of an error line when asked', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce('https://saved/a')
      .mockRejectedValueOnce(new Error('network'));
    const onBatchDone = vi.fn();
    const { container } = render(
      <ImagePicker
        tourScope={scope}
        upload={upload}
        onChange={vi.fn()}
        multiple
        onBatchDone={onBatchDone}
        maxBytes={5}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const big = new File(['123456789'], 'big.png', { type: 'image/png' });
    fireEvent.change(input, {
      target: { files: [png('a.png'), big, png('c.png')] },
    });
    await waitFor(() =>
      expect(onBatchDone).toHaveBeenCalledWith({
        added: 1,
        failed: 1,
        tooLarge: 1,
      })
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a single file as a batch too', async () => {
    const onBatchDone = vi.fn();
    const { container } = render(
      <ImagePicker
        tourScope={scope}
        upload={vi.fn().mockResolvedValue('https://saved/a')}
        onChange={vi.fn()}
        multiple
        onBatchDone={onBatchDone}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await waitFor(() =>
      expect(onBatchDone).toHaveBeenCalledWith({
        added: 1,
        failed: 0,
        tooLarge: 0,
      })
    );
  });

  it('takes only the first file without multiple', async () => {
    const upload = vi.fn().mockResolvedValue('https://saved/1');
    const { container } = render(
      <ImagePicker tourScope={scope} upload={upload} onChange={vi.fn()} />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [png('a.png'), png('b.png')] },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it('disables every source while disabled', () => {
    render(
      <ImagePicker
        tourScope={scope}
        upload={vi.fn()}
        onChange={vi.fn()}
        disabled
      />
    );
    for (const name of ['Upload', 'Google Drive', 'Image link']) {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name }).disabled
      ).toBe(true);
    }
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

  it('keeps an https image link as a link for a caller that takes links', async () => {
    const upload = vi.fn();
    const onChange = vi.fn();
    render(
      <ImagePicker
        tourScope={scope}
        upload={upload}
        onChange={onChange}
        keepLinks
      />
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

  it('saves a linked image through the caller upload by default', async () => {
    const upload = vi.fn().mockResolvedValue('https://saved.example/a.png');
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
      })
    );
    try {
      render(
        <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
      fireEvent.change(screen.getByLabelText('Image link'), {
        target: { value: 'https://example.org/a.png' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith('https://saved.example/a.png')
      );
      expect((upload.mock.calls[0][0] as File).type).toBe('image/png');
      expect((upload.mock.calls[0][0] as File).name).toBe('a.png');
      expect(onChange).not.toHaveBeenCalledWith('https://example.org/a.png');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a link to a web page instead of saving it', async () => {
    const upload = vi.fn();
    const onChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () =>
          Promise.resolve(new Blob(['<html>'], { type: 'text/html' })),
      })
    );
    try {
      render(
        <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
      fireEvent.change(screen.getByLabelText('Image link'), {
        target: { value: 'https://example.org/page' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(
        /can't be used here/
      );
      expect(upload).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a link the browser cannot fetch', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('cors')));
    try {
      render(
        <ImagePicker tourScope={scope} upload={vi.fn()} onChange={onChange} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
      fireEvent.change(screen.getByLabelText('Image link'), {
        target: { value: 'https://example.org/a.png' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(
        /can't be used here/
      );
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('takes a PDF from Drive when the caller allows one', async () => {
    openPicker.mockResolvedValue({ id: 'd3' });
    getDriveFileAsBlob.mockResolvedValue({
      blob: new Blob(['%PDF'], { type: 'application/pdf' }),
      mimeType: 'application/pdf',
      name: 'test.pdf',
    });
    const upload = vi.fn().mockResolvedValue('https://saved/5');
    render(
      <ImagePicker
        tourScope={scope}
        upload={upload}
        onChange={vi.fn()}
        allowPdf
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive' }));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(openPicker).toHaveBeenCalledWith({ mode: 'images-pdf' });
    expect((upload.mock.calls[0][0] as File).type).toBe('application/pdf');
  });

  it('takes only the first dropped file unless it allows several', async () => {
    const upload = vi.fn().mockResolvedValue('https://saved/6');
    const onChange = vi.fn();
    render(
      <ImagePicker tourScope={scope} upload={upload} onChange={onChange} />
    );
    const zone = screen.getByText('Drop or paste an image')
      .parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [png('a.png'), png('b.png')] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(1);
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

  it('hands several files to a caller that saves them itself', async () => {
    const takeFiles = vi.fn().mockResolvedValue(true);
    const video = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const { container } = render(
      <ImagePicker
        tourScope={scope}
        takeFiles={takeFiles}
        multiple
        acceptFile={(f) => /^(image|video)\//.test(f.type)}
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.multiple).toBe(true);
    fireEvent.change(input, {
      target: {
        files: [
          png(),
          new File(['x'], 'a.pdf', { type: 'application/pdf' }),
          video,
        ],
      },
    });
    await waitFor(() => expect(takeFiles).toHaveBeenCalledTimes(1));
    expect((takeFiles.mock.calls[0][0] as File[]).map((f) => f.name)).toEqual([
      'cat.png',
      'clip.mp4',
    ]);
  });

  it('fetches a link as a file for a caller that needs the bytes', async () => {
    const takeFiles = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<ImagePicker tourScope={scope} takeFiles={takeFiles} />);
      fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
      fireEvent.change(screen.getByLabelText('Image link'), {
        target: { value: 'https://example.org/a.png' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(takeFiles).toHaveBeenCalledTimes(1));
      expect((takeFiles.mock.calls[0][0] as File[])[0].type).toBe('image/png');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('names a linked file without an encoded slash', async () => {
    const takeFiles = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
      })
    );
    try {
      render(<ImagePicker tourScope={scope} takeFiles={takeFiles} />);
      fireEvent.click(screen.getByRole('button', { name: 'Image link' }));
      fireEvent.change(screen.getByLabelText('Image link'), {
        target: { value: 'https://example.org/dir%2Fa.png' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(takeFiles).toHaveBeenCalledTimes(1));
      expect((takeFiles.mock.calls[0][0] as File[])[0].name).toBe('dir-a.png');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens a detached picker under any element and closes once added', async () => {
    const handle = createRef<ImagePickerHandle>();
    const takeFiles = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <ImagePicker
        layout="detached"
        handleRef={handle}
        label="Replace image"
        tourScope={scope}
        takeFiles={takeFiles}
      />
    );
    expect(screen.queryByRole('button', { name: 'Replace image' })).toBeNull();
    const row = document.createElement('div');
    document.body.appendChild(row);
    act(() => handle.current?.openAt(row));
    expect(screen.getByRole('dialog', { name: 'Replace image' })).toBeTruthy();
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Replace image' })).toBeNull()
    );
    expect(takeFiles).toHaveBeenCalledTimes(1);
    row.remove();
  });

  it('stays open on a scroll that leaves its button in place, and closes when it moves', () => {
    render(
      <div data-testid="host">
        <ImagePicker
          layout="button"
          label="Insert image"
          buttonContent={() => <span>Replace</span>}
          tourScope={scope}
          upload={vi.fn()}
          onChange={vi.fn()}
        />
      </div>
    );
    const button = screen.getByRole('button', { name: 'Insert image' });
    expect(button.textContent).toBe('Replace');
    let top = 100;
    button.getBoundingClientRect = () =>
      ({ top, left: 10, bottom: top + 20, right: 30 }) as DOMRect;
    fireEvent.click(button);
    const host = screen.getByTestId('host');
    fireEvent.scroll(host);
    expect(screen.getByRole('dialog', { name: 'Insert image' })).toBeTruthy();
    top = 140;
    fireEvent.scroll(host);
    expect(screen.queryByRole('dialog', { name: 'Insert image' })).toBeNull();
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
