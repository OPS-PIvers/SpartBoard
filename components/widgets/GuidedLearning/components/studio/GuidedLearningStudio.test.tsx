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
import type { GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStudio } from './GuidedLearningStudio';

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

const openDialog = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: openDialog.current,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

function buildSet(): GuidedLearningSet {
  return {
    id: 'set-1',
    schemaVersion: 3,
    title: 'Timer tour',
    imageUrls: ['https://example.com/slide-1.png'],
    steps: [
      {
        id: 'step-1',
        xPct: 40,
        yPct: 30,
        imageIndex: 0,
        interactionType: 'tooltip',
        showOverlay: 'tooltip',
        text: 'Click **Start**',
      },
    ],
    mode: 'guided',
    createdAt: 1,
    updatedAt: 1,
  };
}

function renderStudio(
  props: Partial<React.ComponentProps<typeof GuidedLearningStudio>> = {}
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const utils = render(
    <GuidedLearningStudio
      set={buildSet()}
      meta={null}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />
  );
  return { ...utils, onSave, onClose };
}

const frame = () => screen.getByTestId('gl-device-frame');
const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key, ...init });

let restore: (() => void) | null = null;
let fireResize: () => void = () => undefined;
beforeEach(() => {
  localStorage.clear();
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  fireResize = handle.fireResize;
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  vi.useRealTimers();
});

describe('GuidedLearningStudio', () => {
  it('opens full screen on the set with the stage in a device frame', () => {
    renderStudio();
    expect(screen.getByTestId('gl-studio')).toBeInTheDocument();
    expect(screen.getByLabelText('Activity title')).toHaveValue('Timer tour');
    expect(frame()).toHaveAttribute('data-preset', 'board');
    expect(frame().style.width).toBe('720px');
    expect(frame().style.height).toBe('520px');
  });

  it('sizes the frame to the chosen preset in true pixels and remembers it', () => {
    renderStudio();
    fireEvent.change(screen.getByLabelText('Preview size'), {
      target: { value: 'chromebook' },
    });
    expect(frame().style.width).toBe('1366px');
    expect(frame().style.height).toBe('657px');
    // The student app's footer strip is reserved below the stage.
    expect(screen.getByTestId('gl-device-stage').style.height).toBe('589px');
    cleanup();
    renderStudio();
    expect(frame()).toHaveAttribute('data-preset', 'chromebook');
  });

  it('renders the selected tooltip step exactly as the player does', () => {
    const { container } = renderStudio();
    act(() => fireResize());
    act(() => {
      pressKey(']');
    });
    expect(
      container.ownerDocument.querySelector('[data-gl-callout="step-1"]')
    ).not.toBeNull();
    expect(screen.getByTestId('gl-studio-selection')).toBeInTheDocument();
  });

  it('deletes the selected step and undoes it with Ctrl+Z', () => {
    renderStudio();
    act(() => {
      pressKey(']');
    });
    act(() => {
      pressKey('Delete');
    });
    expect(
      screen.getByLabelText('Activity title').nextSibling
    ).toHaveTextContent('0 steps');
    act(() => {
      pressKey('z', { ctrlKey: true });
    });
    expect(
      screen.getByLabelText('Activity title').nextSibling
    ).toHaveTextContent('1 step');
  });

  it('leaves the keyboard to an open dialog', () => {
    openDialog.current = { id: 'd1', kind: 'alert' };
    renderStudio();
    act(() => {
      pressKey(']');
      pressKey('Delete');
    });
    openDialog.current = null;
    expect(
      screen.getByLabelText('Activity title').nextSibling
    ).toHaveTextContent('1 step');
  });

  it('ignores shortcuts typed inside a text field', () => {
    renderStudio();
    act(() => {
      pressKey(']');
    });
    const title = screen.getByLabelText('Activity title');
    fireEvent.keyDown(title, { key: 'Delete' });
    expect(title.nextSibling).toHaveTextContent('1 step');
  });

  it('autosaves after an edit', async () => {
    vi.useFakeTimers();
    const { onSave } = renderStudio();
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Timer tour, revised' },
    });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: 'set-1',
      title: 'Timer tour, revised',
    });
  });

  it('hands the latest draft to the classic editor', async () => {
    const onOpenClassic = vi.fn();
    const { onSave } = renderStudio({ onOpenClassic });
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Edited in Studio' },
    });
    fireEvent.click(screen.getByText('Open classic editor'));
    await waitFor(() => expect(onOpenClassic).toHaveBeenCalledTimes(1));
    // The pending edit is saved first, so the classic editor opens on it.
    expect(onSave).toHaveBeenCalled();
    expect(onOpenClassic.mock.calls[0][0]).toMatchObject({
      id: 'set-1',
      title: 'Edited in Studio',
    });
  });

  it('shows the activity settings when no step is selected', () => {
    renderStudio();
    const settings = screen.getByTestId('gl-studio-set-settings');
    expect(settings).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guided' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('opens a step from the timeline in the properties panel', () => {
    renderStudio();
    const timeline = screen.getByRole('region', { name: 'Steps on slide 1' });
    fireEvent.click(within(timeline).getByRole('button', { name: 'Step 1' }));
    expect(screen.queryByTestId('gl-studio-set-settings')).toBeNull();
    expect(screen.getByDisplayValue('Click **Start**')).toBeInTheDocument();
    expect(
      within(timeline).getByRole('button', { name: 'Step 1' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the step it is given', () => {
    renderStudio({ initialStepId: 'step-1' });
    expect(screen.queryByTestId('gl-studio-set-settings')).toBeNull();
    expect(screen.getByDisplayValue('Click **Start**')).toBeInTheDocument();
  });

  it('flags recorder-drafted text until it is edited', () => {
    renderStudio({
      initialStepId: 'step-1',
      aiDrafts: new Map([['step-1', { label: '', text: 'Click **Start**' }]]),
    });
    expect(screen.getByText('AI draft')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Click **Start**'), {
      target: { value: 'Press Start' },
    });
    expect(screen.queryByText('AI draft')).toBeNull();
  });

  it('lists slides with their step counts', () => {
    renderStudio();
    expect(
      screen.getByRole('button', { name: 'Slide 1, 1 step' })
    ).toHaveAttribute('aria-current', 'true');
  });

  it('plays from the selected step and returns to the step that was showing', () => {
    const set = buildSet();
    set.mode = 'structured';
    set.steps = [
      ...set.steps,
      {
        id: 'step-2',
        xPct: 70,
        yPct: 60,
        imageIndex: 0,
        interactionType: 'tooltip',
        showOverlay: 'tooltip',
        text: 'Then press Stop',
      },
    ];
    renderStudio({ set });
    act(() => {
      pressKey(']');
    });
    act(() => {
      pressKey(']');
    });
    act(() => {
      pressKey(' ', { shiftKey: true });
    });
    const play = screen.getByTestId('gl-studio-play');
    expect(screen.queryByTestId('gl-studio-selection')).toBeNull();
    expect(within(play).getByText('Then press Stop')).toBeInTheDocument();
    expect(within(play).queryByText('Start')).toBeNull();
    fireEvent.click(
      within(play).getAllByRole('button', { name: 'Previous step' })[0]
    );
    expect(within(play).getByText('Start')).toBeInTheDocument();
    act(() => {
      pressKey('Escape');
    });
    expect(screen.queryByTestId('gl-studio-play')).toBeNull();
    const timeline = screen.getByRole('region', { name: 'Steps on slide 1' });
    expect(
      within(timeline).getByRole('button', { name: 'Step 1' })
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
