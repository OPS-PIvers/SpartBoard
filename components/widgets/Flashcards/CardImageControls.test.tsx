import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardImageButton } from './CardImageControls';
import { useCardImage, type CardImageUploader } from './useCardImage';

let flagOn = true;
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) => id === 'unified-image-picker' && flagOn,
  }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn(), isConnected: true }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

const png = () => new File(['x'], 'cat.png', { type: 'image/png' });

const Side: React.FC<{
  upload: CardImageUploader;
  onUrl: (url: string) => void;
}> = ({ upload, onUrl }) => {
  const image = useCardImage(upload, onUrl);
  return (
    <div data-testid="side" {...image.targetProps}>
      <textarea aria-label="Term 1" />
      <CardImageButton
        image={image}
        url={undefined}
        label="Term 1"
        side="term"
        fieldKey="row-1"
        upload={upload}
        onPick={onUrl}
        onRemove={vi.fn()}
      />
    </div>
  );
};

describe('CardImageButton', () => {
  beforeEach(() => {
    flagOn = true;
  });

  it('opens the shared picker and keeps the term image anchor', () => {
    render(<Side upload={vi.fn()} onUrl={vi.fn()} />);
    const open = screen.getByRole('button', { name: 'Add image to Term 1' });
    expect(open.getAttribute('data-tour')).toBe('flashcards.card-term-image');
    fireEvent.click(open);
    expect(
      screen.getByRole('dialog', { name: 'Add image to Term 1' })
    ).toBeTruthy();
    for (const name of ['Upload', 'Google Drive', 'Image link']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('uploads a file dropped on the button once', async () => {
    const upload = vi.fn().mockResolvedValue('https://drive/1');
    const onUrl = vi.fn();
    render(<Side upload={upload} onUrl={onUrl} />);
    fireEvent.drop(
      screen.getByRole('button', { name: 'Add image to Term 1' }),
      { dataTransfer: { types: ['Files'], files: [png()] } }
    );
    await waitFor(() => expect(onUrl).toHaveBeenCalledWith('https://drive/1'));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('still takes an image pasted into the side', async () => {
    const upload = vi.fn().mockResolvedValue('https://drive/2');
    const onUrl = vi.fn();
    render(<Side upload={upload} onUrl={onUrl} />);
    fireEvent.paste(screen.getByLabelText('Term 1'), {
      clipboardData: {
        items: [{ getAsFile: () => png() }],
        files: [png()],
        types: ['Files'],
      },
    });
    await waitFor(() => expect(onUrl).toHaveBeenCalledWith('https://drive/2'));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('shows an error in the panel when the image cannot be used', async () => {
    const upload = vi.fn().mockResolvedValue(null);
    const onUrl = vi.fn();
    const { container } = render(<Side upload={upload} onUrl={onUrl} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add image to Term 1' })
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onUrl).not.toHaveBeenCalled();
  });

  it('keeps the old button with the flag off', () => {
    flagOn = false;
    render(<Side upload={vi.fn()} onUrl={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add image to Term 1' })
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
