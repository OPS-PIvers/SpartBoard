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
import type { GuidedLearningSet, LibraryFolder } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import { COMPACT_HEADER_QUERY, SMALL_SCREEN_QUERY } from './useMediaQuery';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    canAccessFeature: (id: string) => id === 'gemini-functions',
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

const buildSet = (): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Timer tour',
  imageUrls: [
    'https://example.com/slide-1.png',
    'https://example.com/slide-2.png',
  ],
  steps: [
    {
      id: 'step-1',
      xPct: 20,
      yPct: 30,
      imageIndex: 0,
      interactionType: 'tooltip',
      text: 'One',
    },
  ],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
});

const FOLDERS: LibraryFolder[] = [];

/** Stubs matchMedia so exactly the listed queries match. */
const screenMatches = (queries: string[]) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: queries.includes(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );

let restore: (() => void) | null = null;
function renderStudio() {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  render(
    <GuidedLearningStudio
      set={buildSet()}
      meta={null}
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onOpenClassic={vi.fn()}
      folders={FOLDERS}
      folderId={null}
      onFolderChange={vi.fn()}
    />
  );
  act(() => handle.fireResize());
}

const header = () => within(screen.getByRole('banner'));
const moreButton = () => screen.queryByRole('button', { name: 'More actions' });

beforeEach(() => {
  localStorage.clear();
  uploadImage.mockReset();
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  vi.unstubAllGlobals();
});

describe('Studio header overflow', () => {
  it('shows every header action inline on a laptop-width screen', () => {
    screenMatches([]);
    renderStudio();
    expect(moreButton()).toBeNull();
    expect(
      header().getByRole('button', { name: 'Keyboard shortcuts (?)' })
    ).toBeInTheDocument();
    expect(
      header().getByRole('button', { name: /Draft with AI/ })
    ).toBeInTheDocument();
    expect(
      header().getByRole('button', { name: 'Open classic editor' })
    ).toBeInTheDocument();
    expect(header().getByText('Preview size')).not.toHaveClass('sr-only');
  });

  it('folds the less-used actions into one menu below 1100px and keeps undo, preview and close', () => {
    screenMatches([COMPACT_HEADER_QUERY]);
    renderStudio();
    for (const name of ['Undo', 'Redo', 'Close editor'])
      expect(header().getByRole('button', { name })).toBeInTheDocument();
    expect(
      header().getByRole('button', { name: /Play from here/ })
    ).toBeInTheDocument();
    expect(
      header().queryByRole('button', { name: 'Keyboard shortcuts (?)' })
    ).toBeNull();
    expect(
      header().queryByRole('button', { name: /Draft with AI/ })
    ).toBeNull();
    expect(
      header().queryByRole('button', { name: 'Open classic editor' })
    ).toBeNull();
    // The preset select keeps its name with the label visually hidden.
    expect(header().getByText('Preview size')).toHaveClass('sr-only');

    fireEvent.click(moreButton() as HTMLElement);
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((el) => el.textContent)
    ).toEqual([
      'Draft with AI',
      'Not in a folder',
      'Keyboard shortcuts (?)',
      'Open classic editor',
    ]);
  });

  it('opens the shortcut sheet from the menu by keyboard and returns focus to the trigger on Escape', async () => {
    screenMatches([COMPACT_HEADER_QUERY]);
    renderStudio();
    const trigger = moreButton() as HTMLElement;
    trigger.focus();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'More actions' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(menu).getAllByRole('menuitem')[0]
      )
    );
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Keyboard shortcuts (?)' })
    );
    expect(
      screen.getByRole('dialog', { name: /Keyboard shortcuts/ })
    ).toBeInTheDocument();
  });

  it('opens the folder picker from the menu', () => {
    screenMatches([COMPACT_HEADER_QUERY]);
    renderStudio();
    fireEvent.click(moreButton() as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Not in a folder' }));
    expect(screen.getByText('Move to folder')).toBeInTheDocument();
  });
});

describe('Studio on a small screen', () => {
  it('shows a dismissible larger-screen note below 900px that stays dismissed', () => {
    screenMatches([COMPACT_HEADER_QUERY, SMALL_SCREEN_QUERY]);
    renderStudio();
    const note = screen.getByTestId('gl-studio-small-screen-note');
    expect(note).toHaveTextContent(/works best on a larger screen/);
    // Non-blocking: the canvas stays usable behind it.
    expect(
      screen.getByRole('application', { name: 'Slide canvas' })
    ).toBeInTheDocument();
    fireEvent.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('gl-studio-small-screen-note')).toBeNull();
    cleanup();
    restore?.();
    renderStudio();
    expect(screen.queryByTestId('gl-studio-small-screen-note')).toBeNull();
  });

  it('shows no note on a laptop-width screen', () => {
    screenMatches([COMPACT_HEADER_QUERY]);
    renderStudio();
    expect(screen.queryByTestId('gl-studio-small-screen-note')).toBeNull();
  });

  it('starts with the filmstrip folded on a tablet and unfolds it', () => {
    screenMatches([COMPACT_HEADER_QUERY, SMALL_SCREEN_QUERY]);
    renderStudio();
    const strip = screen.getByTestId('gl-studio-filmstrip');
    expect(strip).toHaveAttribute('data-collapsed', 'true');
    expect(strip).toHaveTextContent('1/2');
    expect(screen.queryByRole('button', { name: /^Slide 1, / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show slides' }));
    expect(
      screen.getAllByRole('button', { name: /^Slide \d+, / })
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Hide slides' }));
    expect(screen.getByTestId('gl-studio-filmstrip')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });

  it('keeps the filmstrip open on a laptop', () => {
    screenMatches([]);
    renderStudio();
    expect(screen.getByTestId('gl-studio-filmstrip')).not.toHaveAttribute(
      'data-collapsed'
    );
  });
});

describe('Whole-canvas drop after touch gestures', () => {
  it('still takes a dropped file after a pinch on the canvas', async () => {
    screenMatches([]);
    uploadImage.mockResolvedValue({
      url: 'https://example.com/third.png',
      storagePath: 's',
    });
    renderStudio();
    const layer = screen.getByTestId('gl-studio-edit-layer');
    const touch = (id: number, x: number) => ({
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: x,
      clientY: 200,
    });
    fireEvent.pointerDown(layer, touch(1, 200));
    fireEvent.pointerDown(layer, touch(2, 300));
    fireEvent.pointerMove(layer, touch(2, 400));
    fireEvent.pointerUp(layer, touch(2, 400));
    fireEvent.pointerUp(layer, touch(1, 200));
    expect(screen.getByTestId('gl-studio-zoom').textContent).not.toBe('100%');
    const file = new File(['x'], 'three.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('gl-studio-viewport'), {
      dataTransfer: { types: ['Files'], files: [file], dropEffect: 'none' },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /^Slide \d+, / })
      ).toHaveLength(3)
    );
  });
});
