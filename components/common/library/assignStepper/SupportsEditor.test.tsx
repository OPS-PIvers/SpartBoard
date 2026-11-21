import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { QuizSupport } from '@/types';

const mocks = vi.hoisted(() => ({
  openPicker: vi.fn(),
  ensureGoogleScope: vi.fn(),
  uploadFile: vi.fn(),
  makePublic: vi.fn(),
  copyFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileMetadata: vi.fn(),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    driveService: {
      uploadFile: mocks.uploadFile,
      makePublic: mocks.makePublic,
      copyFile: mocks.copyFile,
      deleteFile: mocks.deleteFile,
      getFileMetadata: mocks.getFileMetadata,
    },
  }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: mocks.openPicker }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: mocks.ensureGoogleScope }),
}));

import { SupportsEditor } from './SupportsEditor';

let latest: QuizSupport[] = [];

const Harness: React.FC = () => {
  const [supports, setSupports] = useState<QuizSupport[]>([]);
  return (
    <div role="dialog">
      <SupportsEditor
        supports={supports}
        onChange={(update) =>
          setSupports((prev) => {
            latest = update(prev);
            return latest;
          })
        }
      />
    </div>
  );
};

const png = () => new File(['x'], 'image.png', { type: 'image/png' });

function pasteEvent(files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files, types: ['Files'] },
  });
  return event;
}

const openFileForm = async () => {
  await userEvent.click(screen.getByRole('button', { name: /Add/ }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'File' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
  mocks.uploadFile.mockResolvedValue({ id: 'up1' });
  mocks.copyFile.mockResolvedValue({ id: 'copy1' });
  mocks.makePublic.mockResolvedValue(undefined);
  mocks.getFileMetadata.mockResolvedValue({ name: 'Notes.pdf' });
  mocks.ensureGoogleScope.mockResolvedValue('token');
});

describe('SupportsEditor file support', () => {
  it('keeps Text and Link next to File', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Add/ }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items).toEqual(['Text', 'Link', 'File']);
  });

  it('shows the shared upload, Drive and link sources', async () => {
    render(<Harness />);
    await openFileForm();
    expect(screen.getByText('Drag a file or paste an image')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Choose from Drive' })
    ).toBeVisible();
    expect(screen.getByPlaceholderText('Paste a link')).toBeVisible();
  });

  it('uploads a chosen file to Drive and shares it', async () => {
    render(<Harness />);
    await openFileForm();
    const input = screen.getByTestId('support-file-input');
    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'Map.pdf', { type: 'application/pdf' })],
      },
    });
    await waitFor(() =>
      expect(latest).toEqual([
        { kind: 'drive', title: 'Map.pdf', fileId: 'up1' },
      ])
    );
    expect(mocks.uploadFile.mock.calls[0][2]).toBe('Assets/QuizSupports');
    expect(mocks.makePublic).toHaveBeenCalledWith('up1', undefined);
  });

  it('uploads a pasted image', async () => {
    render(<Harness />);
    await openFileForm();
    const zone = screen.getByTestId('support-file-drop-zone');
    expect(zone).toHaveFocus();
    zone.dispatchEvent(pasteEvent([png()]));
    await waitFor(() =>
      expect(latest).toEqual([
        { kind: 'drive', title: 'Pasted image', fileId: 'up1' },
      ])
    );
  });

  it('ignores a paste while the file form is closed', () => {
    render(<Harness />);
    document.body.dispatchEvent(pasteEvent([png()]));
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('copies and shares a pasted Drive link', async () => {
    render(<Harness />);
    await openFileForm();
    await userEvent.type(
      screen.getByPlaceholderText('Paste a link'),
      'https://drive.google.com/file/d/abc123DEF/view{Enter}'
    );
    await waitFor(() =>
      expect(latest).toEqual([
        { kind: 'drive', title: 'Notes.pdf', fileId: 'copy1' },
      ])
    );
    expect(mocks.copyFile).toHaveBeenCalledWith(
      'abc123DEF',
      'Notes.pdf',
      'Assets/QuizSupports'
    );
  });

  it('adds any other pasted web page as a link', async () => {
    render(<Harness />);
    await openFileForm();
    await userEvent.type(
      screen.getByPlaceholderText('Paste a link'),
      'https://example.com/page{Enter}'
    );
    await waitFor(() =>
      expect(latest).toEqual([
        {
          kind: 'link',
          title: 'example.com',
          url: 'https://example.com/page',
        },
      ])
    );
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('copies and shares a file picked from Drive', async () => {
    mocks.openPicker.mockResolvedValue({
      id: 'pick1',
      name: 'Word bank.docx',
      mimeType: 'application/vnd.google-apps.document',
    });
    render(<Harness />);
    await openFileForm();
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose from Drive' })
    );
    await waitFor(() =>
      expect(latest).toEqual([
        { kind: 'drive', title: 'Word bank.docx', fileId: 'copy1' },
      ])
    );
  });
});
