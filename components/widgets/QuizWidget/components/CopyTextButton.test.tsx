import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopyTextButton } from './CopyTextButton';

const mockClipboard = (writeText: (t: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });

describe('CopyTextButton', () => {
  it('copies html as plain text with line breaks and shows Copied', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    mockClipboard(writeText);
    render(
      <CopyTextButton
        html="<p>First <b>line</b></p><p>Second</p>"
        label="Copy response"
        copiedLabel="Copied"
        caption="Copy"
        className=""
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy response' }));
    await act(() => Promise.resolve());
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^First line\n+Second\n?$/)
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('does not claim Copied when the clipboard refuses', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')));
    render(
      <CopyTextButton
        text="hello"
        label="Copy selected text"
        copiedLabel="Copied"
        className=""
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy selected text' }));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });
});
