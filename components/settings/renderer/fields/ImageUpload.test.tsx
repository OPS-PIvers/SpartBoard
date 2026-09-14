import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ImageUploadField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const mockUploadDisplayImage =
  vi.fn<(uid: string, file: File) => Promise<string>>();
const mockDeleteFile = vi.fn<(url: string) => Promise<void>>();
const authState: { user: { uid: string } | null } = { user: { uid: 'u1' } };
const pickerState = { isConnected: false };

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    deleteFile: mockDeleteFile,
    uploadDisplayImage: mockUploadDisplayImage,
    uploadSticker: vi.fn(),
    uploadHotspotImage: vi.fn(),
  }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({
    openPicker: vi.fn(),
    isConnected: pickerState.isConnected,
  }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

import { FieldRenderer } from '../FieldRenderer';

const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const field: ImageUploadField<string> = {
  type: 'imageUpload',
  key: 'imageUrl',
  label: 'label',
};

function renderField(
  config: Record<string, unknown>,
  updateConfig = vi.fn(),
  override: Partial<ImageUploadField<string>> = {}
) {
  return render(
    <FieldRenderer
      field={{ ...field, ...override }}
      widget={widget}
      ctx={makeCtx(config)}
      updateConfig={updateConfig}
    />
  );
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('uploadImage', {
    selector: 'input[type="file"]',
  });
}

function makeFile(type = 'image/png', size = 10): File {
  const file = new File(['x'], 'pic.png', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeEach(() => {
  mockUploadDisplayImage.mockReset();
  mockDeleteFile.mockReset().mockResolvedValue(undefined);
  authState.user = { uid: 'u1' };
  pickerState.isConnected = false;
});

describe('ImageUpload field', () => {
  it('renders an upload button and no preview when empty', () => {
    renderField({});
    expect(screen.getByRole('group', { name: 'Label' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'uploadImage' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(fileInput()).toHaveAttribute('accept', 'image/*');
  });

  it('respects a custom accept string', () => {
    renderField({}, vi.fn(), { accept: 'image/png' });
    expect(fileInput()).toHaveAttribute('accept', 'image/png');
  });

  it('shows a thumbnail, Replace and Clear for an existing URL', () => {
    const updateConfig = vi.fn();
    renderField({ imageUrl: 'https://example.com/a.png' }, updateConfig);
    expect(screen.getByRole('img', { name: 'imagePreview' })).toHaveAttribute(
      'src',
      'https://example.com/a.png'
    );
    expect(
      screen.getByRole('button', { name: 'replaceImage' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clearImage' }));
    expect(updateConfig).toHaveBeenCalledWith({ imageUrl: '' });
    expect(mockDeleteFile).toHaveBeenCalledWith('https://example.com/a.png');
  });

  it('uploads a local file and writes the returned URL', async () => {
    mockUploadDisplayImage.mockResolvedValue('https://cdn/img.png');
    const updateConfig = vi.fn();
    renderField({}, updateConfig);
    const file = makeFile();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() =>
      expect(updateConfig).toHaveBeenCalledWith({
        imageUrl: 'https://cdn/img.png',
      })
    );
    expect(mockUploadDisplayImage).toHaveBeenCalledWith('u1', file);
  });

  it('deletes the previous owned image after a successful replacement', async () => {
    mockUploadDisplayImage.mockResolvedValue('https://cdn/new.png');
    const updateConfig = vi.fn();
    renderField({ imageUrl: 'https://cdn/old.png' }, updateConfig);
    fireEvent.change(fileInput(), { target: { files: [makeFile()] } });
    await waitFor(() =>
      expect(mockDeleteFile).toHaveBeenCalledWith('https://cdn/old.png')
    );
    expect(updateConfig).toHaveBeenCalledWith({
      imageUrl: 'https://cdn/new.png',
    });
  });

  it('rejects files over 5 MB and non-images without uploading', async () => {
    const updateConfig = vi.fn();
    renderField({}, updateConfig);
    fireEvent.change(fileInput(), {
      target: { files: [makeFile('image/png', 5 * 1024 * 1024 + 1)] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('imageTooLarge');
    fireEvent.change(fileInput(), {
      target: { files: [makeFile('text/plain')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'imageInvalidType'
    );
    expect(mockUploadDisplayImage).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('reports upload failures inline', async () => {
    mockUploadDisplayImage.mockRejectedValue(new Error('nope'));
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const updateConfig = vi.fn();
    renderField({}, updateConfig);
    fireEvent.change(fileInput(), { target: { files: [makeFile()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'imageUploadFailed'
    );
    expect(updateConfig).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('asks the teacher to sign in when there is no user', async () => {
    authState.user = null;
    renderField({});
    fireEvent.change(fileInput(), { target: { files: [makeFile()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'signInToUpload'
    );
    expect(mockUploadDisplayImage).not.toHaveBeenCalled();
  });

  it('offers the Drive picker only when Drive is connected', () => {
    const { unmount } = renderField({});
    expect(screen.queryByRole('button', { name: 'imageFromDrive' })).toBeNull();
    unmount();
    pickerState.isConnected = true;
    renderField({});
    expect(
      screen.getByRole('button', { name: 'imageFromDrive' })
    ).toBeInTheDocument();
  });

  it('honours disabled', () => {
    renderField({ imageUrl: 'https://example.com/a.png' }, vi.fn(), {
      disabledWhen: () => true,
    });
    expect(screen.getByRole('button', { name: 'replaceImage' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'clearImage' })).toBeDisabled();
  });

  it('has no structural axe violations', async () => {
    pickerState.isConnected = true;
    const { container } = renderField({
      imageUrl: 'https://example.com/a.png',
    });
    expect(await axe(container, STRUCTURAL_ONLY)).toHaveNoViolations();
  });
});
