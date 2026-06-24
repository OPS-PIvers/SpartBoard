/**
 * DriveFileAttachment — focused tests for the onExtractingChange inline-call
 * behaviour (formerly a useEffect anti-pattern; now called directly in the
 * handlePick handler at the same state transitions).
 *
 * Verifies three invariants:
 *   1. onExtractingChange is NOT called on mount (no spurious initial fire).
 *   2. onExtractingChange(true) fires when extraction begins.
 *   3. onExtractingChange(false) fires when extraction ends (success path).
 *   4. onExtractingChange(false) fires when extraction ends (error/cancel path).
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module-level mocks ──────────────────────────────────────────────────────

const mockOpenPicker =
  vi.fn<() => Promise<{ id: string; name: string; mimeType: string } | null>>();
const mockGetDriveFileTextContent =
  vi.fn<(fileId: string) => Promise<string | null>>();

vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({
    openPicker: mockOpenPicker,
    isConnected: true, // Must be true or component renders null
  }),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    getDriveFileTextContent: mockGetDriveFileTextContent,
  }),
}));

// ─── Import component AFTER mocks are registered ────────────────────────────
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_FILE = {
  id: 'file-123',
  name: 'report.gdoc',
  mimeType: 'application/vnd.google-apps.document',
};

function renderComponent(
  onExtractingChange = vi.fn(),
  onFileContent = vi.fn()
) {
  return render(
    <DriveFileAttachment
      onFileContent={onFileContent}
      onExtractingChange={onExtractingChange}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DriveFileAttachment — onExtractingChange inline-call behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT fire onExtractingChange on mount', () => {
    const onExtractingChange = vi.fn();
    renderComponent(onExtractingChange);
    expect(onExtractingChange).not.toHaveBeenCalled();
  });

  it('fires onExtractingChange(true) when extraction starts, then onExtractingChange(false) on success', async () => {
    // Arrange: picker resolves immediately, extraction takes one tick
    let resolveExtract!: (text: string) => void;
    const extractPromise = new Promise<string>((res) => {
      resolveExtract = res;
    });
    mockOpenPicker.mockResolvedValue(FAKE_FILE);
    mockGetDriveFileTextContent.mockReturnValue(extractPromise);

    const onExtractingChange = vi.fn();
    const onFileContent = vi.fn();
    renderComponent(onExtractingChange, onFileContent);

    const button = screen.getByRole('button', {
      name: /attach file from drive/i,
    });

    // Act: click the button; picker resolves synchronously in this test
    await userEvent.click(button);

    // At this point openPicker has resolved and setIsExtracting(true) was called.
    // onExtractingChange(true) should have fired.
    expect(onExtractingChange).toHaveBeenCalledWith(true);
    expect(onExtractingChange).toHaveBeenCalledTimes(1);

    // Now let extraction complete
    await act(async () => {
      resolveExtract('extracted text content');
      await Promise.resolve();
    });

    // onExtractingChange(false) should now have fired exactly once
    expect(onExtractingChange).toHaveBeenCalledWith(false);
    expect(onExtractingChange).toHaveBeenCalledTimes(2);

    // And the content callback received the text
    expect(onFileContent).toHaveBeenCalledWith(
      'extracted text content',
      FAKE_FILE.name
    );
  });

  it('fires onExtractingChange(false) when getDriveFileTextContent returns null (unsupported file)', async () => {
    mockOpenPicker.mockResolvedValue(FAKE_FILE);
    mockGetDriveFileTextContent.mockResolvedValue(null); // extraction fails

    const onExtractingChange = vi.fn();
    renderComponent(onExtractingChange);

    const button = screen.getByRole('button', {
      name: /attach file from drive/i,
    });
    await userEvent.click(button);

    await waitFor(() => {
      // Should have fired true then false
      expect(onExtractingChange).toHaveBeenCalledWith(true);
      expect(onExtractingChange).toHaveBeenCalledWith(false);
      expect(onExtractingChange).toHaveBeenCalledTimes(2);
    });
  });

  it('fires onExtractingChange(false) when getDriveFileTextContent throws', async () => {
    mockOpenPicker.mockResolvedValue(FAKE_FILE);
    mockGetDriveFileTextContent.mockRejectedValue(new Error('network error'));

    const onExtractingChange = vi.fn();
    renderComponent(onExtractingChange);

    const button = screen.getByRole('button', {
      name: /attach file from drive/i,
    });
    await userEvent.click(button);

    await waitFor(() => {
      expect(onExtractingChange).toHaveBeenCalledWith(true);
      expect(onExtractingChange).toHaveBeenCalledWith(false);
      expect(onExtractingChange).toHaveBeenCalledTimes(2);
    });
  });

  it('fires only onExtractingChange(false) when user cancels the picker (finally runs, but true was never sent)', async () => {
    // When picker returns null, handlePick early-returns inside try BEFORE
    // calling setIsExtracting(true)/onExtractingChange(true). The finally block
    // still executes, so onExtractingChange(false) fires once but (true) never does.
    mockOpenPicker.mockResolvedValue(null); // user cancelled

    const onExtractingChange = vi.fn();
    renderComponent(onExtractingChange);

    const button = screen.getByRole('button', {
      name: /attach file from drive/i,
    });
    await userEvent.click(button);

    await waitFor(() => {
      expect(onExtractingChange).toHaveBeenCalledTimes(1);
      expect(onExtractingChange).toHaveBeenCalledWith(false);
      expect(onExtractingChange).not.toHaveBeenCalledWith(true);
    });
  });
});
