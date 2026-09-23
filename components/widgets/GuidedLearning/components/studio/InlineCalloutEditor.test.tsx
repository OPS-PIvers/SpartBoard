import React, { useEffect, useMemo } from 'react';
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
import { mockStageLayout, rect } from '@/tests/utils/mockStageLayout';
import {
  useGuidedLearningEditorState,
  type GuidedLearningEditorController,
} from '../useGuidedLearningEditorState';
import { StudioCanvas } from './StudioCanvas';
import { useCanvasTools } from './useCanvasTools';
import { useStudioShortcuts, type StudioShortcut } from './useStudioShortcuts';
import { presetById } from './devicePresets';
import { countWords, safeLinkUrl, wrapSelection } from './inlineText';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user' }, isAdmin: true }),
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

const BOARD = presetById('board');
const CALLOUT = rect(600, 400, 100, 60);

const buildSet = (overlay: 'tooltip' | 'banner'): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Canvas',
  imageUrls: ['https://example.com/slide.png'],
  steps: [
    {
      id: 'step-1',
      xPct: 25,
      yPct: 25,
      imageIndex: 0,
      interactionType: overlay === 'tooltip' ? 'tooltip' : 'spotlight',
      showOverlay: overlay,
      label: 'Timer',
      text: 'First',
      region: { shape: 'rect', wPct: 20, hPct: 20 },
    },
  ],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
});

const dialog = {
  currentDialog: null,
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn().mockResolvedValue(true),
  showPrompt: vi.fn(),
};

const latest: { current: GuidedLearningEditorController | null } = {
  current: null,
};
const Harness: React.FC<{ overlay: 'tooltip' | 'banner' }> = ({ overlay }) => {
  const state = useGuidedLearningEditorState({
    existingSet: buildSet(overlay),
    existingMeta: null,
  });
  const tools = useCanvasTools(state, BOARD);
  const { deleteStep, selectedStepId } = state;
  const keymap = useMemo<StudioShortcut[]>(
    () => [
      {
        id: 'delete',
        key: 'Delete',
        run: () => selectedStepId && deleteStep(selectedStepId),
      },
      ...tools.rows,
    ],
    [tools.rows, deleteStep, selectedStepId]
  );
  useStudioShortcuts(keymap, { editing: tools.editingStepId !== null });
  useEffect(() => {
    latest.current = state;
  });
  return (
    <StudioCanvas state={state} tools={tools} setId="set-1" preset={BOARD} />
  );
};

const step = () => {
  const s = latest.current?.steps[0];
  if (!s) throw new Error('no step');
  return s;
};
const layer = () => screen.getByTestId('gl-studio-edit-layer');
const textField = (): HTMLTextAreaElement => {
  const el = screen.getByRole('textbox', { name: 'Callout text' });
  if (!(el instanceof HTMLTextAreaElement)) throw new Error('no textarea');
  return el;
};

function mount(overlay: 'tooltip' | 'banner' = 'tooltip') {
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
    rectFor: (el) => (el.hasAttribute('data-gl-callout') ? CALLOUT : null),
  });
  restore = handle.restore;
  render(
    <DialogContext.Provider value={dialog as unknown as DialogContextValue}>
      <Harness overlay={overlay} />
    </DialogContext.Provider>
  );
  act(() => handle.fireResize());
  // Select the step by clicking inside its region.
  fireEvent.pointerDown(layer(), {
    button: 0,
    pointerId: 1,
    clientX: 18 * 7.2,
    clientY: 18 * 5.2,
  });
  fireEvent.pointerUp(layer(), {
    pointerId: 1,
    clientX: 18 * 7.2,
    clientY: 18 * 5.2,
  });
}
const openEditor = () =>
  fireEvent.doubleClick(layer(), { clientX: 620, clientY: 420 });

let restore: (() => void) | null = null;
beforeEach(() => {
  dialog.showAlert.mockClear();
  dialog.showPrompt.mockReset();
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  latest.current = null;
});

describe('inline callout editing', () => {
  it('opens on a callout double-click with the label and text as plain fields', () => {
    mount();
    openEditor();
    expect(screen.getByTestId('gl-inline-editor')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Callout title' })).toHaveValue(
      'Timer'
    );
    expect(textField()).toHaveValue('First');
    expect(textField()).toHaveFocus();
    expect(document.querySelector('[contenteditable]')).toBeNull();
  });

  it('opens with Enter when a step is selected', () => {
    mount();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('gl-inline-editor')).toBeInTheDocument();
  });

  it('writes typing straight to the step', () => {
    mount();
    openEditor();
    fireEvent.change(textField(), { target: { value: 'Press Start' } });
    expect(step().text).toBe('Press Start');
    fireEvent.change(screen.getByRole('textbox', { name: 'Callout title' }), {
      target: { value: 'Go' },
    });
    expect(step().label).toBe('Go');
  });

  it('lets R, E and Delete type into the text instead of firing tools', () => {
    mount();
    openEditor();
    for (const key of ['r', 'e', 'Delete']) {
      const ev = fireEvent.keyDown(textField(), { key });
      expect(ev).toBe(true);
    }
    expect(latest.current?.addingStep).toBe(false);
    expect(latest.current?.steps).toHaveLength(1);
    expect(screen.getByTestId('gl-inline-editor')).toBeInTheDocument();
  });

  it('wraps the selection in ** with Ctrl+B', () => {
    mount();
    openEditor();
    textField().setSelectionRange(0, 5);
    fireEvent.keyDown(textField(), { key: 'b', ctrlKey: true });
    expect(step().text).toBe('**First**');
  });

  it('commits and closes on Escape', () => {
    mount();
    openEditor();
    fireEvent.change(textField(), { target: { value: 'Kept' } });
    fireEvent.keyDown(textField(), { key: 'Escape' });
    expect(screen.queryByTestId('gl-inline-editor')).toBeNull();
    expect(step().text).toBe('Kept');
  });

  it('closes when focus leaves the callout', () => {
    mount();
    openEditor();
    fireEvent.focusOut(textField(), { relatedTarget: document.body });
    expect(screen.queryByTestId('gl-inline-editor')).toBeNull();
  });

  it('rejects a javascript: link and wraps an https one with Ctrl+K', async () => {
    mount();
    openEditor();
    dialog.showPrompt.mockResolvedValueOnce('javascript:alert(1)');
    textField().setSelectionRange(0, 5);
    fireEvent.keyDown(textField(), { key: 'k', ctrlKey: true });
    await waitFor(() => expect(dialog.showAlert).toHaveBeenCalled());
    expect(step().text).toBe('First');

    dialog.showPrompt.mockResolvedValueOnce('https://example.com/help');
    textField().setSelectionRange(0, 5);
    fireEvent.keyDown(textField(), { key: 'k', ctrlKey: true });
    await waitFor(() =>
      expect(step().text).toBe('[First](https://example.com/help)')
    );
  });

  it('keeps editing open when Escape cancels the link prompt', () => {
    mount();
    openEditor();
    dialog.showPrompt.mockReturnValueOnce(new Promise(() => undefined));
    fireEvent.keyDown(textField(), { key: 'k', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('gl-inline-editor')).toBeInTheDocument();
  });

  it('edits a banner in place and counts words past 25', () => {
    mount('banner');
    openEditor();
    const banner = document.querySelector('[data-position]');
    expect(
      banner?.querySelector('[data-testid="gl-inline-editor"]')
    ).not.toBeNull();
    fireEvent.change(textField(), {
      target: { value: Array.from({ length: 30 }, () => 'word').join(' ') },
    });
    expect(screen.getByTestId('gl-inline-word-count')).toHaveTextContent(
      '30 words'
    );
  });
});

describe('inline text helpers', () => {
  it('accepts only https links', () => {
    expect(safeLinkUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(safeLinkUrl('http://example.com')).toBeNull();
    expect(safeLinkUrl('https://exa mple.com')).toBeNull();
    expect(safeLinkUrl('https://example.com/)x')).toBeNull();
  });

  it('wraps a selection or inserts a fallback', () => {
    expect(wrapSelection('Click Start', 6, 11, '**', '**')).toEqual({
      value: 'Click **Start**',
      start: 8,
      end: 13,
    });
    expect(
      wrapSelection('Go ', 3, 3, '[', '](https://a.b)', 'https://a.b').value
    ).toBe('Go [https://a.b](https://a.b)');
    expect(countWords('  one two\nthree ')).toBe(3);
  });
});
