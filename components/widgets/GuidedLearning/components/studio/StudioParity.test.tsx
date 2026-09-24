import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  LibraryFolder,
} from '@/types';
import type { CaptureMode } from '../ScreenCaptureModal';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStudio } from './GuidedLearningStudio';

const NEW_URL = 'https://lh3.googleusercontent.com/d/new-slide';

const auth = vi.hoisted(() => ({
  user: { uid: 'test-user' },
  isAdmin: true,
  canAccessFeature: (id: string) => id === 'gemini-functions',
}));
const storage = vi.hoisted(() => ({
  uploading: false,
  uploadHotspotImage: vi.fn<(userId: string, file: File) => Promise<string>>(),
  uploadGuidedLearningMedia: vi.fn(),
  uploadGuidedLearningImage: vi.fn(),
  deleteFile: vi.fn(),
  deleteDriveFile: vi.fn(),
}));
const dialog = vi.hoisted(() => ({
  currentDialog: null,
  showAlert: vi.fn<(message: string) => Promise<void>>(),
  showConfirm: vi.fn<(message: string, opts?: unknown) => Promise<boolean>>(),
  showPrompt: vi.fn<(message: string) => Promise<string | null>>(),
}));

vi.mock('@/context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useStorage', () => ({ useStorage: () => storage }));
vi.mock('@/context/useDialog', () => ({ useDialog: () => dialog }));
vi.mock('../GuidedLearningAIGenerator', () => ({
  GuidedLearningAIGenerator: () => <div data-testid="ai-generator" />,
}));
vi.mock('../ScreenCaptureModal', () => ({
  ScreenCaptureModal: ({ mode }: { mode: CaptureMode }) => (
    <div data-testid="capture-modal">{mode}</div>
  ),
}));

const SLIDE_1 = 'https://example.com/slide-1.png';
const SLIDE_2 = 'https://example.com/slide-2.png';

const tooltipStep: GuidedLearningStep = {
  id: 'step-1',
  xPct: 40,
  yPct: 30,
  imageIndex: 0,
  interactionType: 'tooltip',
  showOverlay: 'tooltip',
  text: 'Click **Start**',
};

const buildSet = (
  patch: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Timer tour',
  imageUrls: [SLIDE_1],
  steps: [tooltipStep],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

type StudioProps = React.ComponentProps<typeof GuidedLearningStudio>;

let restore: (() => void) | null = null;

function renderStudio(props: Partial<StudioProps> = {}) {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  const onSave = vi.fn<StudioProps['onSave']>().mockResolvedValue(undefined);
  const onClose = vi.fn<StudioProps['onClose']>();
  render(
    <GuidedLearningStudio
      set={buildSet()}
      meta={null}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />
  );
  act(() => handle.fireResize());
  return { onSave, onClose };
}

async function closeAndGetSaved(
  onSave: ReturnType<typeof vi.fn<StudioProps['onSave']>>,
  onClose: ReturnType<typeof vi.fn<StudioProps['onClose']>>
): Promise<GuidedLearningSet> {
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const last = onSave.mock.lastCall;
  if (!last) throw new Error('onSave was never called');
  return last[0];
}

const selectFirstStep = () => {
  const timeline = screen.getByRole('region', { name: 'Steps on slide 1' });
  fireEvent.click(within(timeline).getByRole('button', { name: 'Step 1' }));
};

const setInteraction = (from: string, to: string) =>
  fireEvent.change(screen.getByDisplayValue(from), { target: { value: to } });

const gif = (name = 'shot.gif') =>
  new File(['gif'], name, { type: 'image/gif' });

const filmstrip = () => screen.getByRole('navigation', { name: 'Slides' });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.isAdmin = true;
  dialog.showAlert.mockResolvedValue(undefined);
  dialog.showConfirm.mockResolvedValue(false);
  dialog.showPrompt.mockResolvedValue(null);
  storage.uploadGuidedLearningImage.mockResolvedValue({
    url: NEW_URL,
    storagePath: '',
  });
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe('Guided Learning Studio parity with the classic editor', () => {
  it('opens the AI generator from the header only when onAiGenerated is given', () => {
    renderStudio({ onAiGenerated: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    expect(screen.getByTestId('ai-generator')).toBeInTheDocument();
    cleanup();
    restore?.();
    renderStudio();
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).toBeNull();
  });

  it.each([
    ['Snap screen frames', 'snap'],
    ['Record your screen', 'record'],
  ])(
    'opens the screen capture modal from the capture menu: %s',
    (item, mode) => {
      renderStudio();
      fireEvent.click(
        within(filmstrip()).getByRole('button', { name: /Capture screen/ })
      );
      fireEvent.click(
        screen.getByRole('menuitem', { name: new RegExp(`^${item}`) })
      );
      expect(screen.getByTestId('capture-modal')).toHaveTextContent(mode);
    }
  );

  it('shows the trim control for a video slide with nothing selected', async () => {
    const duration = vi
      .spyOn(HTMLMediaElement.prototype, 'duration', 'get')
      .mockReturnValue(30);
    try {
      renderStudio({
        set: buildSet({
          imageUrls: ['https://example.com/clip.mp4'],
          imageKinds: ['video'],
          steps: [],
        }),
      });
      expect(screen.getByText('Slide 1 video')).toBeInTheDocument();
      const video = document.querySelector('main video');
      if (video) fireEvent(video, new Event('loadedmetadata'));
      expect(
        await screen.findByRole('slider', { name: 'Trim start' })
      ).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Trim end' })).toHaveAttribute(
        'aria-valuenow',
        '30'
      );
    } finally {
      duration.mockRestore();
    }
  });

  it('saves the welcome message once the welcome chip is on', async () => {
    const { onSave, onClose } = renderStudio();
    fireEvent.click(
      screen.getByRole('button', { name: 'Welcome screen: Off' })
    );
    const popover = screen.getByRole('dialog', {
      name: 'Welcome screen settings',
    });
    fireEvent.click(
      within(popover).getByRole('checkbox', { name: /Show welcome screen/ })
    );
    fireEvent.change(within(popover).getByRole('textbox'), {
      target: { value: 'Welcome to the timer tour.' },
    });
    const saved = await closeAndGetSaved(onSave, onClose);
    expect(saved.welcomeEnabled).toBe(true);
    expect(saved.welcomeMessage).toBe('Welcome to the timer tour.');
  });

  it('saves the hotspot pulse and image transition chosen on the chips', async () => {
    const { onSave, onClose } = renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Pulse: Consistent' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Reminder/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transition: None' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Fade/ }));
    expect(
      screen.getByRole('button', { name: 'Pulse: Reminder' })
    ).toBeInTheDocument();
    const saved = await closeAndGetSaved(onSave, onClose);
    expect(saved.hotspotPulse).toBe('reminder');
    expect(saved.imageTransition).toBe('fade');
  });

  it('adds a slide from the file picker', async () => {
    renderStudio();
    const input = filmstrip().querySelector('input[type="file"]');
    if (!input) throw new Error('no file input');
    fireEvent.change(input, { target: { files: [gif()] } });
    expect(
      await screen.findByRole('button', { name: 'Slide 2, 0 steps' })
    ).toBeInTheDocument();
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledWith(
      'test-user',
      expect.any(File),
      'shot.gif',
      expect.stringMatching(/^(drive|storage)$/)
    );
  });

  it('adds a slide from files dropped on the filmstrip', async () => {
    renderStudio();
    fireEvent.drop(filmstrip(), {
      dataTransfer: { files: [gif('dropped.gif')], types: ['Files'] },
    });
    expect(
      await screen.findByRole('button', { name: 'Slide 2, 0 steps' })
    ).toBeInTheDocument();
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledTimes(1);
  });

  it('adds a slide from an image pasted anywhere outside a text field', async () => {
    renderStudio();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [gif('pasted.gif')] },
    });
    act(() => {
      document.body.dispatchEvent(paste);
    });
    expect(
      await screen.findByRole('button', { name: 'Slide 2, 0 steps' })
    ).toBeInTheDocument();
    expect(paste.defaultPrevented).toBe(true);
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledTimes(1);
  });

  it('deletes a slide from its filmstrip button', async () => {
    const { onSave, onClose } = renderStudio({
      set: buildSet({ imageUrls: [SLIDE_1, SLIDE_2] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete slide 2' }));
    expect(
      screen.queryByRole('button', { name: /^Slide 2,/ })
    ).not.toBeInTheDocument();
    const saved = await closeAndGetSaved(onSave, onClose);
    expect(saved.imageUrls).toEqual([SLIDE_1]);
  });

  it('offers every question type on a question step and saves the choice', async () => {
    const { onSave, onClose } = renderStudio();
    selectFirstStep();
    setInteraction('Tooltip', 'question');
    const questionType = screen.getByDisplayValue('Multiple Choice');
    expect(
      within(questionType)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Multiple Choice', 'Matching', 'Sorting']);
    fireEvent.change(questionType, { target: { value: 'sorting' } });
    expect(screen.getByText('Items in correct order')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Sorting'), {
      target: { value: 'matching' },
    });
    expect(screen.getByText('Matching Pairs')).toBeInTheDocument();
    const saved = await closeAndGetSaved(onSave, onClose);
    expect(saved.steps[0].interactionType).toBe('question');
    expect(saved.steps[0].question?.type).toBe('matching');
  });

  it('saves audio and video URLs entered on a step', async () => {
    const { onSave, onClose } = renderStudio();
    selectFirstStep();
    setInteraction('Tooltip', 'audio');
    fireEvent.change(
      screen.getByPlaceholderText('Paste an audio URL (.mp3, .wav, .ogg)…'),
      { target: { value: 'https://example.com/clip.mp3' } }
    );
    setInteraction('Audio', 'video');
    fireEvent.change(
      screen.getByPlaceholderText('Paste a YouTube or direct video URL…'),
      { target: { value: 'https://youtu.be/abc123' } }
    );
    const saved = await closeAndGetSaved(onSave, onClose);
    expect(saved.steps[0]).toMatchObject({
      interactionType: 'video',
      audioUrl: 'https://example.com/clip.mp3',
      videoUrl: 'https://youtu.be/abc123',
    });
  });

  it('moves the set to a folder from the header folder control', () => {
    const folders: LibraryFolder[] = [
      { id: 'f1', name: 'Unit 1', parentId: null, order: 0, createdAt: 1 },
    ];
    const onFolderChange = vi.fn<(folderId: string | null) => void>();
    renderStudio({ folders, folderId: null, onFolderChange });
    fireEvent.click(screen.getByRole('button', { name: 'Not in a folder' }));
    const picker = screen.getByRole('dialog', { name: 'Move to folder' });
    fireEvent.click(within(picker).getByRole('button', { name: /Unit 1/ }));
    expect(onFolderChange).toHaveBeenCalledWith('f1');
  });

  it('asks before closing when the save fails, and stays open on cancel', async () => {
    const { onSave, onClose } = renderStudio();
    onSave.mockRejectedValue(new Error('offline'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Timer tour, revised' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
      await waitFor(() => expect(dialog.showConfirm).toHaveBeenCalled());
      expect(dialog.showConfirm.mock.calls[0][1]).toMatchObject({
        title: 'Changes not saved',
        cancelLabel: 'Keep editing',
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('gl-studio')).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
