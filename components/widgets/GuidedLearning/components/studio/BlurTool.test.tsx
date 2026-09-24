import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  DialogContext,
  type DialogContextValue,
} from '@/context/DialogContextValue';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStudio } from './GuidedLearningStudio';

const OLD_URL = 'https://lh3.googleusercontent.com/d/old-id';
const NEW_URL = 'https://lh3.googleusercontent.com/d/new-id';

const storage = vi.hoisted(() => ({
  uploading: false,
  uploadHotspotImage: vi.fn(),
  uploadGuidedLearningMedia: vi.fn(),
  uploadGuidedLearningImage: vi.fn(),
  deleteFile: vi.fn(),
  deleteDriveFile: vi.fn(),
}));
const drive = vi.hoisted(() => ({ downloadFile: vi.fn() }));
const redact = vi.hoisted(() =>
  vi.fn<typeof import('../../utils/redactImage').redactImage>()
);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    canAccessFeature: () => false,
  }),
}));
vi.mock('@/hooks/useStorage', () => ({ useStorage: () => storage }));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: drive }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));
vi.mock('../../utils/redactImage', () => ({ redactImage: redact }));
const prepareSpy = vi.hoisted(() =>
  vi.fn((file: File) => Promise.resolve(file))
);
vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: prepareSpy,
}));

const dialog = {
  currentDialog: null,
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn().mockResolvedValue(true),
  showPrompt: vi.fn(),
};

const buildSet = (kind: 'image' | 'video' = 'image'): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Roster tour',
  imageUrls: [OLD_URL],
  ...(kind === 'video' ? { imageKinds: ['video' as const] } : {}),
  steps: [],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
});

function renderStudio(kind: 'image' | 'video' = 'image') {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <DialogContext.Provider value={dialog as unknown as DialogContextValue}>
      <GuidedLearningStudio
        set={buildSet(kind)}
        meta={null}
        onClose={onClose}
        onSave={onSave}
      />
    </DialogContext.Provider>
  );
  act(() => handle.fireResize());
  return { onSave, onClose };
}

const blurButton = () =>
  screen.getByRole('button', { name: 'Blur part of this slide (B)' });
const showsSlide = (url: string) =>
  Array.from(document.querySelectorAll('img')).some((img) => img.src === url);

function drawArea() {
  const layer = screen.getByTestId('gl-blur-layer');
  fireEvent.pointerDown(layer, {
    button: 0,
    pointerId: 1,
    clientX: 72,
    clientY: 52,
  });
  fireEvent.pointerMove(layer, { pointerId: 1, clientX: 288, clientY: 208 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 288, clientY: 208 });
}

async function applyBlur() {
  fireEvent.keyDown(window, { key: 'b' });
  drawArea();
  fireEvent.click(screen.getByRole('button', { name: 'Apply blur' }));
  await waitFor(() => expect(showsSlide(NEW_URL)).toBe(true));
}

const closeStudio = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

let restore: (() => void) | null = null;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  dialog.showConfirm.mockResolvedValue(true);
  drive.downloadFile.mockResolvedValue(new Blob(['original']));
  redact.mockResolvedValue(new Blob(['blurred'], { type: 'image/webp' }));
  storage.uploadGuidedLearningImage.mockResolvedValue({
    url: NEW_URL,
    storagePath: '',
    driveFileId: 'new-id',
  });
  storage.deleteDriveFile.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe('Studio blur tool', () => {
  it('draws areas and bakes them into a replacement slide', async () => {
    renderStudio();
    await applyBlur();

    expect(dialog.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining(
        'The unblurred original is deleted when you close the editor.'
      ),
      expect.anything()
    );
    expect(drive.downloadFile).toHaveBeenCalledWith('old-id');
    const [, rects, opts] = redact.mock.calls[0];
    expect(rects).toHaveLength(1);
    expect(rects[0].xPct).toBeCloseTo(10);
    expect(rects[0].yPct).toBeCloseTo(10);
    expect(rects[0].wPct).toBeCloseTo(30);
    expect(rects[0].hPct).toBeCloseTo(30);
    expect(opts).toEqual({ mode: 'blur' });
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({ type: 'image/webp' }),
      'redacted.webp',
      'drive'
    );
    expect(showsSlide(OLD_URL)).toBe(false);
    expect(screen.queryByTestId('gl-blur-layer')).toBeNull();
  });

  it('deletes the original exactly once when the editor closes', async () => {
    const { onClose } = renderStudio();
    await applyBlur();
    closeStudio();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    closeStudio();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(storage.deleteDriveFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteDriveFile).toHaveBeenCalledWith('old-id');
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('undo restores the original and keeps it', async () => {
    const { onClose } = renderStudio();
    await applyBlur();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(showsSlide(OLD_URL)).toBe(true);
    expect(showsSlide(NEW_URL)).toBe(false);
    closeStudio();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(storage.deleteDriveFile).not.toHaveBeenCalled();
  });

  it('changes nothing when the confirm is cancelled', async () => {
    dialog.showConfirm.mockResolvedValue(false);
    renderStudio();
    fireEvent.keyDown(window, { key: 'b' });
    drawArea();
    fireEvent.click(screen.getByRole('button', { name: 'Apply blur' }));
    await waitFor(() => expect(dialog.showConfirm).toHaveBeenCalled());
    expect(drive.downloadFile).not.toHaveBeenCalled();
    expect(showsSlide(OLD_URL)).toBe(true);
    expect(screen.getAllByTestId('gl-blur-area')).toHaveLength(1);
  });

  it('is off on video slides', () => {
    renderStudio('video');
    expect(blurButton()).toBeDisabled();
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.queryByTestId('gl-blur-layer')).toBeNull();
  });

  it('removes an area and leaves with Escape', () => {
    renderStudio();
    fireEvent.click(blurButton());
    drawArea();
    fireEvent.click(screen.getByRole('button', { name: 'Remove area 1' }));
    expect(screen.queryByTestId('gl-blur-area')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gl-blur-layer')).toBeNull();
  });
});
