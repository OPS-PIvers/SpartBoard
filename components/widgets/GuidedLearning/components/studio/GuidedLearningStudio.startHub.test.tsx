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
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { TOUR_RECORD_EVENT } from '@/components/tours/tourState';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import {
  resetStepClipboardForTests,
  writeStepClipboard,
} from './stepClipboard';

const auth = vi.hoisted(() => ({
  isAdmin: true as boolean | null,
  features: new Set<string>(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: auth.isAdmin,
    canAccessFeature: (id: string) => auth.features.has(id),
  }),
}));

const uploadImage = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    uploadGuidedLearningImage: uploadImage,
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));

vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: null,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../GuidedLearningAIGenerator', () => ({
  GuidedLearningAIGenerator: () => <div data-testid="ai-generator" />,
}));
vi.mock('../ScreenCaptureModal', () => ({
  ScreenCaptureModal: ({ mode }: { mode: string }) => (
    <div data-testid="capture-modal">{mode}</div>
  ),
}));

function emptySet(): GuidedLearningSet {
  return {
    id: 'set-new',
    schemaVersion: 3,
    title: '',
    imageUrls: [],
    steps: [],
    mode: 'guided',
    createdAt: 1,
    updatedAt: 1,
  };
}

function fullSet(): GuidedLearningSet {
  return {
    ...emptySet(),
    id: 'set-full',
    title: 'Timer tour',
    imageUrls: ['https://example.com/slide-1.png'],
  };
}

const addToast = vi.fn();
const onClose = vi.fn();

function renderStudio(
  set: GuidedLearningSet = emptySet(),
  extra: Partial<React.ComponentProps<typeof GuidedLearningStudio>> = {},
  onParentDrop?: () => void
) {
  const value = { addToast } as unknown as DashboardContextValue;
  return render(
    <DashboardContext.Provider value={value}>
      <div onDrop={onParentDrop}>
        <GuidedLearningStudio
          set={set}
          meta={null}
          onClose={onClose}
          onSave={vi.fn().mockResolvedValue(undefined)}
          {...extra}
        />
      </div>
    </DashboardContext.Provider>
  );
}

const target = (id: string) => screen.queryByTestId(`gl-studio-hub-${id}`);
const dropZone = () => screen.getByTestId('gl-studio-canvas-drop');
const fileDrag = (files: File[] = []) => ({
  dataTransfer: { types: ['Files'], files, dropEffect: 'none' },
});

let restore: (() => void) | null = null;
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
);
const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });

beforeEach(() => {
  auth.isAdmin = true;
  auth.features = new Set();
  sessionStorage.clear();
  resetStepClipboardForTests();
  addToast.mockReset();
  onClose.mockReset();
  uploadImage.mockReset();
  setClipboard({ read: vi.fn().mockResolvedValue([]) });
  restore = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  }).restore;
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  if (originalClipboard)
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
});

describe('Studio start hub', () => {
  it('shows the always-available targets on an empty set, and nothing gated without its flag', () => {
    renderStudio(emptySet(), { onAiGenerated: vi.fn() });
    expect(screen.getByTestId('gl-studio-hub')).toBeInTheDocument();
    expect(target('upload')).toHaveTextContent('Upload or drop');
    expect(target('paste')).toBeEnabled();
    expect(target('capture')).toBeInTheDocument();
    expect(target('record')).toBeNull();
    expect(target('ai')).toBeNull();
    expect(target('import')).toBeNull();
  });

  it('shows the canvas, not the hub, once the set has a slide', () => {
    renderStudio(fullSet());
    expect(screen.queryByTestId('gl-studio-hub')).toBeNull();
    expect(screen.getByTestId('gl-studio-viewport')).toBeInTheDocument();
  });

  describe('Record a tour', () => {
    it('needs both admin and gl-live-tours', () => {
      auth.features = new Set(['gl-live-tours']);
      auth.isAdmin = false;
      const { unmount } = renderStudio();
      expect(target('record')).toBeNull();
      unmount();

      auth.isAdmin = true;
      auth.features = new Set();
      const second = renderStudio();
      expect(target('record')).toBeNull();
      second.unmount();

      auth.features = new Set(['gl-live-tours']);
      renderStudio();
      expect(target('record')).toHaveTextContent('Record a tour');
    });

    it('closes the Studio, then starts the recorder', async () => {
      auth.features = new Set(['gl-live-tours']);
      const started = vi.fn();
      window.addEventListener(TOUR_RECORD_EVENT, started);
      renderStudio();
      fireEvent.click(target('record') as HTMLElement);
      await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledTimes(1);
      window.removeEventListener(TOUR_RECORD_EVENT, started);
    });
  });

  describe('Draft with AI', () => {
    it('needs admin, gemini-functions and an AI handler', () => {
      auth.features = new Set(['gemini-functions']);
      auth.isAdmin = false;
      const first = renderStudio(emptySet(), { onAiGenerated: vi.fn() });
      expect(target('ai')).toBeNull();
      first.unmount();

      auth.isAdmin = true;
      auth.features = new Set(['gl-live-tours']);
      const second = renderStudio(emptySet(), { onAiGenerated: vi.fn() });
      expect(target('ai')).toBeNull();
      second.unmount();

      auth.features = new Set(['gemini-functions']);
      const third = renderStudio(emptySet());
      expect(target('ai')).toBeNull();
      third.unmount();

      renderStudio(emptySet(), { onAiGenerated: vi.fn() });
      fireEvent.click(target('ai') as HTMLElement);
      expect(screen.getByTestId('ai-generator')).toBeInTheDocument();
    });
  });

  describe('Import .gl.json', () => {
    it('shows only with an import handler, and closes the Studio before importing', async () => {
      const first = renderStudio();
      expect(target('import')).toBeNull();
      first.unmount();

      const onImport = vi.fn();
      renderStudio(emptySet(), { onImport });
      fireEvent.click(target('import') as HTMLElement);
      await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Paste', () => {
    it('is disabled, with the reason shown, when copied steps are the latest clipboard content', () => {
      writeStepClipboard([
        {
          id: 's',
          xPct: 1,
          yPct: 1,
          imageIndex: 0,
          interactionType: 'tooltip',
        },
      ]);
      renderStudio();
      expect(target('paste')).toBeDisabled();
      expect(target('paste')).toHaveTextContent(
        'Copied steps need a slide to go on.'
      );
    });

    it('is disabled when the browser cannot read the clipboard from a button', () => {
      setClipboard(undefined);
      renderStudio();
      expect(target('paste')).toBeDisabled();
      expect(target('paste')).toHaveAccessibleDescription(
        /can't read the clipboard/
      );
    });

    it('pastes a clipboard image as the first slide', async () => {
      const blob = new Blob(['x'], { type: 'image/png' });
      setClipboard({
        read: vi
          .fn()
          .mockResolvedValue([
            { types: ['image/png'], getType: () => Promise.resolve(blob) },
          ]),
      });
      uploadImage.mockResolvedValue({
        url: 'https://example.com/pasted.png',
        storagePath: 'p',
      });
      renderStudio();
      fireEvent.click(target('paste') as HTMLElement);
      await waitFor(() =>
        expect(screen.queryByTestId('gl-studio-hub')).toBeNull()
      );
      expect(uploadImage).toHaveBeenCalledTimes(1);
    });

    it('turns an empty clipboard into a translated error toast', async () => {
      renderStudio();
      fireEvent.click(target('paste') as HTMLElement);
      await waitFor(() =>
        expect(addToast).toHaveBeenCalledWith(
          "There's no image on the clipboard.",
          'error'
        )
      );
    });
  });

  it('Capture screen opens screen capture in snap mode', () => {
    renderStudio();
    fireEvent.click(target('capture') as HTMLElement);
    expect(screen.getByTestId('capture-modal')).toHaveTextContent('snap');
  });
});

describe('Whole-canvas drop', () => {
  it('uploads files dropped anywhere on the empty canvas, without reaching the board behind', async () => {
    uploadImage.mockResolvedValue({
      url: 'https://example.com/dropped.png',
      storagePath: 'd',
    });
    const parentDrop = vi.fn();
    renderStudio(emptySet(), {}, parentDrop);
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.dragEnter(dropZone(), fileDrag());
    expect(screen.getByTestId('gl-studio-drop-overlay')).toBeInTheDocument();
    fireEvent.drop(dropZone(), fileDrag([file]));
    expect(screen.queryByTestId('gl-studio-drop-overlay')).toBeNull();
    await waitFor(() =>
      expect(screen.queryByTestId('gl-studio-hub')).toBeNull()
    );
    expect(uploadImage).toHaveBeenCalledWith(
      'test-user',
      file,
      'shot.png',
      'drive'
    );
    expect(parentDrop).not.toHaveBeenCalled();
  });

  it('accepts drops on a canvas that already has slides', async () => {
    uploadImage.mockResolvedValue({
      url: 'https://example.com/second.png',
      storagePath: 's',
    });
    renderStudio(fullSet());
    const file = new File(['x'], 'two.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('gl-studio-viewport'), fileDrag([file]));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /^Slide \d+, / })
      ).toHaveLength(2)
    );
  });

  it('ignores drags that carry no files, and drags that started in the page', () => {
    const parentDrop = vi.fn();
    renderStudio(fullSet(), {}, parentDrop);
    const textDrag = {
      dataTransfer: { types: ['text/plain'], files: [], dropEffect: 'none' },
    };
    fireEvent.dragEnter(dropZone(), textDrag);
    expect(screen.queryByTestId('gl-studio-drop-overlay')).toBeNull();
    fireEvent.drop(dropZone(), textDrag);
    expect(parentDrop).toHaveBeenCalledTimes(1);

    // A dragged <img> inside the page can list "Files" too.
    act(() => {
      document.dispatchEvent(new Event('dragstart'));
    });
    fireEvent.dragEnter(dropZone(), fileDrag());
    expect(screen.queryByTestId('gl-studio-drop-overlay')).toBeNull();
    act(() => {
      document.dispatchEvent(new Event('dragend'));
    });
    fireEvent.dragEnter(dropZone(), fileDrag());
    expect(screen.getByTestId('gl-studio-drop-overlay')).toBeInTheDocument();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('shows a rejected file as a dismissible, translated error toast', async () => {
    renderStudio();
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.drop(dropZone(), fileDrag([file]));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        '"notes.txt" isn\'t a supported file. Use an image, a GIF or a video (MP4, WebM, MOV).',
        'error'
      )
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('caps a batch of failures at three toasts plus a summary', async () => {
    renderStudio();
    const files = ['a', 'b', 'c', 'd', 'e'].map(
      (n) => new File(['x'], `${n}.txt`, { type: 'text/plain' })
    );
    fireEvent.drop(dropZone(), fileDrag(files));
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(4));
    expect(addToast).toHaveBeenLastCalledWith(
      "2 more files couldn't be added.",
      'error'
    );
  });

  it('reports an upload failure as a toast', async () => {
    uploadImage.mockRejectedValue(new Error('storage/unauthorized'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderStudio();
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    fireEvent.drop(dropZone(), fileDrag([file]));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        '"shot.png" didn\'t upload. Try again.',
        'error'
      )
    );
  });
});
