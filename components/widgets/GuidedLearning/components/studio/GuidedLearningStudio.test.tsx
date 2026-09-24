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
import { TOUR_START_EVENT } from '@/components/tours/tourState';
import { GuidedLearningStudio } from './GuidedLearningStudio';

const features = vi.hoisted(() => new Set<string>());
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    canAccessFeature: (id: string) => features.has(id),
  }),
}));

const storage = vi.hoisted(() => ({ uploading: false }));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: storage.uploading,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));

const openDialog = vi.hoisted(() => ({ current: null as unknown }));
const showConfirm = vi.hoisted(() => vi.fn());
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: openDialog.current,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm,
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
  storage.uploading = false;
  showConfirm.mockReset().mockResolvedValue(false);
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  });
  restore = handle.restore;
  fireResize = handle.fireResize;
});
afterEach(() => {
  cleanup();
  features.clear();
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

  it('converts a legacy set’s spotlight radii once at load', async () => {
    restore?.();
    // A 2:1 image in a square stage draws 520×260, so a legacy radius of 25 becomes 50.
    const handle = mockStageLayout({
      container: { w: 520, h: 520 },
      image: { w: 1040, h: 520 },
    });
    restore = handle.restore;
    const set = buildSet();
    delete set.schemaVersion;
    set.steps = [
      {
        id: 'step-1',
        xPct: 10,
        yPct: 20,
        imageIndex: 0,
        interactionType: 'spotlight',
        showOverlay: 'none',
        spotlightRadius: 25,
      },
    ];
    const { onSave, onClose } = renderStudio({ set });
    // The conversion is async, so let it land before closing.
    await act(async () => {
      handle.fireResize();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as GuidedLearningSet;
    expect(saved.schemaVersion).toBe(3);
    expect(saved.steps[0].spotlightRadius).toBe(50);

    cleanup();
    const again = renderStudio({ set: saved });
    act(() => handle.fireResize());
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Reopened' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(again.onClose).toHaveBeenCalled());
    const resaved = again.onSave.mock.calls[0][0] as GuidedLearningSet;
    expect(resaved.steps[0].spotlightRadius).toBe(50);
  });

  it('says what is missing before the set can be used', () => {
    renderStudio();
    const notice = 'Not ready to use yet: give this activity a title.';
    expect(screen.queryByText(notice)).toBeNull();
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: ' ' },
    });
    expect(screen.getByText(notice)).toBeInTheDocument();
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

  describe('Run live on my board', () => {
    const tourSet = (isBuilding = true): GuidedLearningSet => {
      const base = buildSet();
      return {
        ...base,
        isBuilding,
        steps: base.steps.map((step) => ({
          ...step,
          tour: { anchor: 'sidebar.boards', action: 'click' as const },
        })),
      };
    };

    it('is offered only for a building set with live steps, behind the live tours flag', () => {
      renderStudio({ set: tourSet() });
      expect(screen.queryByRole('button', { name: /Run live/ })).toBeNull();
      cleanup();
      features.add('gl-live-tours');
      renderStudio({ set: tourSet(false) });
      expect(screen.queryByRole('button', { name: /Run live/ })).toBeNull();
      cleanup();
      renderStudio({ set: buildSet() });
      expect(screen.queryByRole('button', { name: /Run live/ })).toBeNull();
    });

    it('shows the Live tour link for a selected step only on building sets', () => {
      features.add('gl-live-tours');
      renderStudio({ set: tourSet(false) });
      act(() => {
        pressKey(']');
      });
      expect(screen.queryByTestId('gl-studio-tour-controls')).toBeNull();
      cleanup();
      renderStudio({ set: tourSet() });
      act(() => {
        pressKey(']');
      });
      expect(screen.getByTestId('gl-studio-tour-controls')).toBeInTheDocument();
    });

    it('closes the Studio and starts the saved tour on the board', async () => {
      features.add('gl-live-tours');
      const started = vi.fn();
      const onStart = (e: Event) => {
        started((e as CustomEvent<unknown>).detail);
      };
      window.addEventListener(TOUR_START_EVENT, onStart);
      try {
        const { onClose } = renderStudio({ set: tourSet() });
        fireEvent.click(
          screen.getByRole('button', { name: 'Run live on my board' })
        );
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(started).toHaveBeenCalledWith({ setId: 'set-1' });
      } finally {
        window.removeEventListener(TOUR_START_EVENT, onStart);
      }
    });
  });

  describe('closing', () => {
    const close = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

    it('asks before closing mid-upload and saves what is there if the author closes', async () => {
      storage.uploading = true;
      showConfirm.mockResolvedValue(true);
      const { onClose, onSave } = renderStudio();
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Edited during upload' },
      });
      close();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(showConfirm.mock.calls[0][1]).toMatchObject({
        title: 'A slide is still uploading',
      });
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0]).toMatchObject({
        title: 'Edited during upload',
      });
    });

    it('warns before discarding edits when the save fails mid-upload', async () => {
      storage.uploading = true;
      showConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const onSave = vi.fn().mockRejectedValue(new Error('offline'));
      const { onClose } = renderStudio({ onSave });
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Edited during upload' },
      });
      close();
      await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(2));
      expect(showConfirm.mock.calls[1][1]).toMatchObject({
        title: 'Changes not saved',
      });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('stays open when the author keeps editing during an upload', async () => {
      storage.uploading = true;
      const { onClose } = renderStudio();
      close();
      await waitFor(() => expect(showConfirm).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('warns before discarding a titled set with no slides', async () => {
      const { onClose, onSave } = renderStudio({
        set: { ...buildSet(), imageUrls: [], steps: [] },
      });
      close();
      await waitFor(() => expect(showConfirm).toHaveBeenCalled());
      expect(showConfirm.mock.calls[0][1]).toMatchObject({
        title: 'This set has no slides yet',
        confirmLabel: 'Discard',
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('writes pending edits when unmounted without a close', async () => {
      const { onSave, unmount } = renderStudio();
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Board switched away' },
      });
      unmount();
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave.mock.calls[0][0]).toMatchObject({
        title: 'Board switched away',
      });
    });
  });
});
