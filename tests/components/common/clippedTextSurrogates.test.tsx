import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SmartPastePickerModal } from '@/components/layout/dock/SmartPastePickerModal';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';

vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({
    isConnected: true,
    openPicker: () =>
      Promise.resolve({ id: 'f1', name: 'doc', mimeType: 'text/plain' }),
  }),
}));

// 29,999 ASCII chars then an emoji (2 UTF-16 units) straddling the 30,000 cut
const longText = 'a'.repeat(29_999) + '😀' + 'tail';
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    getDriveFileTextContent: () => Promise.resolve(longText),
  }),
}));

const hasLoneSurrogate = (s: string) =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    s
  );

describe('clipped text keeps surrogate pairs whole', () => {
  it('SmartPaste preview does not split an emoji at the cut', () => {
    const text = 'a'.repeat(119) + '😀' + 'tail';
    const { container } = render(
      <SmartPastePickerModal text={text} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(hasLoneSurrogate(document.body.textContent ?? '')).toBe(false);
    expect(container).toBeTruthy();
  });

  it('Drive attachment text sent to AI does not end in a lone surrogate', async () => {
    const onFileContent = vi.fn();
    render(<DriveFileAttachment onFileContent={onFileContent} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(onFileContent).toHaveBeenCalledWith(expect.any(String), 'doc')
    );
    const sent = onFileContent.mock.calls[0][0] as string;
    expect(hasLoneSurrogate(sent)).toBe(false);
  });
});
