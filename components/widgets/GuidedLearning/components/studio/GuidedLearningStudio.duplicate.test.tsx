import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import { resetStepClipboardForTests } from './stepClipboard';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    canAccessFeature: () => false,
  }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: null,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

function buildSet(id = 'set-1', text = 'Click **Start**'): GuidedLearningSet {
  return {
    id,
    schemaVersion: 3,
    title: 'Timer tour',
    imageUrls: [
      'https://example.com/slide-1.png',
      'https://example.com/slide-2.png',
    ],
    steps: [
      {
        id: `${id}-step-1`,
        xPct: 40,
        yPct: 30,
        imageIndex: 0,
        interactionType: 'tooltip',
        showOverlay: 'tooltip',
        text,
      },
    ],
    mode: 'guided',
    createdAt: 1,
    updatedAt: 1,
  };
}

const addToast = vi.fn();

function renderStudio(set: GuidedLearningSet = buildSet()) {
  const value = { addToast } as unknown as DashboardContextValue;
  return render(
    <DashboardContext.Provider value={value}>
      <GuidedLearningStudio
        set={set}
        meta={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    </DashboardContext.Provider>
  );
}

const subtitle = () => screen.getByLabelText('Activity title').nextSibling;
const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    fireEvent.keyDown(window, { key, ...init });
  });
const selectFirstStep = () => pressKey(']');
const slideButtons = () =>
  screen.getAllByRole('button', { name: /^Slide \d+, / });
const timeline = () => screen.getByRole('region', { name: 'Play order' });

let restore: (() => void) | null = null;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetStepClipboardForTests();
  addToast.mockReset();
  restore = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  }).restore;
});
afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  restore?.();
  restore = null;
});

describe('Studio duplicate and copy/paste', () => {
  it('Ctrl+D duplicates the selected step, and Ctrl+Z removes the copy', () => {
    renderStudio();
    selectFirstStep();
    pressKey('d', { ctrlKey: true });
    expect(subtitle()).toHaveTextContent('2 steps');
    // The copy is selected.
    expect(
      within(timeline()).getByRole('button', { name: 'Step 2' })
    ).toHaveAttribute('aria-pressed', 'true');
    pressKey('z', { ctrlKey: true });
    expect(subtitle()).toHaveTextContent('1 step');
  });

  it('⌘D with no step selected duplicates the current slide and its steps', () => {
    renderStudio();
    pressKey('d', { metaKey: true });
    expect(slideButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Slide 1, 1 step',
      'Slide 2, 1 step',
      'Slide 3, 0 steps',
    ]);
    expect(
      screen.getByRole('button', { name: 'Slide 2, 1 step' })
    ).toHaveAttribute('aria-current', 'true');
    pressKey('z', { ctrlKey: true });
    expect(slideButtons()).toHaveLength(2);
  });

  it('duplicates a slide from its filmstrip menu', () => {
    renderStudio();
    fireEvent.click(screen.getByTestId('gl-studio-slide-menu-0'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate slide/ }));
    expect(slideButtons()).toHaveLength(3);
    expect(subtitle()).toHaveTextContent('2 steps');
  });

  it('duplicates, copies and pastes a step from the timeline menu', () => {
    renderStudio();
    selectFirstStep();
    fireEvent.click(screen.getByTestId('gl-studio-step-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate step/ }));
    expect(subtitle()).toHaveTextContent('2 steps');

    fireEvent.click(screen.getByTestId('gl-studio-step-menu'));
    const paste = screen.getByRole('menuitem', { name: /Paste steps/ });
    expect(paste).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy step/ }));
    expect(addToast).toHaveBeenCalledWith(
      expect.stringContaining('Step copied'),
      'info'
    );

    fireEvent.click(screen.getByTestId('gl-studio-step-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Paste steps/ }));
    expect(subtitle()).toHaveTextContent('3 steps');
  });

  it('copies with Ctrl+C and pastes into another set opened later in the session', () => {
    renderStudio(buildSet('set-a', 'From set A'));
    selectFirstStep();
    pressKey('c', { ctrlKey: true });
    cleanup();

    renderStudio(buildSet('set-b', 'Set B step'));
    // Show slide 2 so the paste lands there.
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2, 0 steps' }));
    pressKey('v', { ctrlKey: true });
    expect(subtitle()).toHaveTextContent('2 steps');
    expect(
      screen.getByRole('button', { name: 'Slide 2, 1 step' })
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('From set A')).toBeInTheDocument();
    pressKey('z', { ctrlKey: true });
    expect(subtitle()).toHaveTextContent('1 step');
  });

  it('pastes copied steps from a browser paste that carries no image', () => {
    renderStudio(buildSet('set-a', 'From set A'));
    selectFirstStep();
    pressKey('c', { ctrlKey: true });
    // Leaving the window means the system clipboard may hold something newer.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    pressKey('v', { ctrlKey: true });
    expect(subtitle()).toHaveTextContent('1 step');
    act(() => {
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', {
        value: { files: [] },
      });
      document.body.dispatchEvent(paste);
    });
    expect(subtitle()).toHaveTextContent('2 steps');
  });

  it('never fires while typing in a field', () => {
    renderStudio();
    selectFirstStep();
    const title = screen.getByLabelText('Activity title');
    fireEvent.keyDown(title, { key: 'd', ctrlKey: true });
    fireEvent.keyDown(title, { key: 'c', ctrlKey: true });
    expect(subtitle()).toHaveTextContent('1 step');
    expect(addToast).not.toHaveBeenCalled();

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    fireEvent.keyDown(editable, { key: 'd', ctrlKey: true });
    expect(subtitle()).toHaveTextContent('1 step');
    editable.remove();
  });

  it('leaves Ctrl+C to the browser while text is selected', () => {
    renderStudio();
    selectFirstStep();
    const range = document.createRange();
    range.selectNodeContents(screen.getByText('Play order'));
    // Focusing the Studio on open leaves a collapsed range, which addRange won't replace.
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const event = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(addToast).not.toHaveBeenCalled();

    window.getSelection()?.removeAllRanges();
    pressKey('c', { ctrlKey: true });
    expect(addToast).toHaveBeenCalledTimes(1);
  });
});
