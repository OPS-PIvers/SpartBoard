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
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import { getOpenModalCount } from '@/components/common/modalStore';
import { getBodyScrollLockCount } from '@/components/common/bodyScrollLock';
import {
  GuidedLearningSaveConflictError,
  type GuidedLearningSaveGuard,
} from '../../utils/saveConflict';

type SaveFn = (
  set: GuidedLearningSet,
  driveFileId?: string,
  guard?: GuidedLearningSaveGuard
) => Promise<void>;

const features = vi.hoisted(() => new Set<string>());
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    featurePermissions: [],
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

type ToastAction = { label: string; onClick: () => void };
const addToast =
  vi.fn<(message: string, type?: string, action?: ToastAction) => void>();

function renderWithToasts(
  props: Partial<React.ComponentProps<typeof GuidedLearningStudio>> = {}
) {
  const value = { addToast } as unknown as DashboardContextValue;
  return render(
    <DashboardContext.Provider value={value}>
      <GuidedLearningStudio
        set={props.set ?? buildSet()}
        meta={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        {...props}
      />
    </DashboardContext.Provider>
  );
}

const lastToastUndo = () => {
  const action = addToast.mock.lastCall?.[2];
  if (!action) throw new Error('no undo action');
  expect(action.label).toBe('Undo');
  return action.onClick;
};

const frame = () => screen.getByTestId('gl-device-frame');
const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key, ...init });

let restore: (() => void) | null = null;
let fireResize: () => void = () => undefined;
beforeEach(() => {
  localStorage.clear();
  storage.uploading = false;
  showConfirm.mockReset().mockResolvedValue(false);
  addToast.mockReset();
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

  it('counts as an open modal while mounted so the widget toolbar and dashboard Escape stand down', () => {
    const modals = getOpenModalCount();
    const locks = getBodyScrollLockCount();
    const { unmount, rerender, onClose, onSave } = renderStudio();
    expect(getOpenModalCount()).toBe(modals + 1);
    expect(getBodyScrollLockCount()).toBe(locks + 1);
    rerender(
      <GuidedLearningStudio
        set={buildSet()}
        meta={null}
        onClose={onClose}
        onSave={onSave}
      />
    );
    expect(getOpenModalCount()).toBe(modals + 1);
    unmount();
    expect(getOpenModalCount()).toBe(modals);
    expect(getBodyScrollLockCount()).toBe(locks);
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

  describe('undo everywhere', () => {
    const subtitle = () => screen.getByLabelText('Activity title').nextSibling;

    it('offers Undo after deleting a step with the Delete key', () => {
      renderWithToasts();
      act(() => {
        pressKey(']');
      });
      act(() => {
        pressKey('Delete');
      });
      expect(addToast).toHaveBeenCalledWith(
        'Step 1 deleted.',
        'info',
        expect.objectContaining({ label: 'Undo' })
      );
      expect(subtitle()).toHaveTextContent('0 steps');
      act(() => lastToastUndo()());
      expect(subtitle()).toHaveTextContent('1 step');
    });

    it('offers Undo after deleting a step from the panel, without asking', () => {
      renderWithToasts({ initialStepId: 'step-1' });
      fireEvent.click(screen.getByRole('button', { name: 'Delete step' }));
      expect(showConfirm).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith(
        'Step 1 deleted.',
        'info',
        expect.objectContaining({ label: 'Undo' })
      );
      expect(subtitle()).toHaveTextContent('0 steps');
      act(() => lastToastUndo()());
      expect(subtitle()).toHaveTextContent('1 step');
    });

    it('offers Undo after deleting a slide from the filmstrip, restoring its steps', () => {
      const set = buildSet();
      set.imageUrls = [...set.imageUrls, 'https://example.com/slide-2.png'];
      renderWithToasts({ set });
      fireEvent.click(screen.getByRole('button', { name: 'Delete slide 1' }));
      expect(showConfirm).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith(
        'Slide 1 deleted.',
        'info',
        expect.objectContaining({ label: 'Undo' })
      );
      expect(
        screen.queryByRole('button', { name: 'Delete slide 2' })
      ).toBeNull();
      expect(subtitle()).toHaveTextContent('0 steps');
      act(() => lastToastUndo()());
      expect(
        screen.getByRole('button', { name: 'Delete slide 2' })
      ).toBeInTheDocument();
      expect(subtitle()).toHaveTextContent('1 step');
    });

    it('never undoes a later edit from a delete toast', () => {
      renderWithToasts();
      act(() => {
        pressKey(']');
      });
      act(() => {
        pressKey('Delete');
      });
      const toastUndo = lastToastUndo();
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Renamed' },
      });
      act(() => toastUndo());
      expect(screen.getByLabelText('Activity title')).toHaveValue('Renamed');
      expect(subtitle()).toHaveTextContent('0 steps');
      expect(addToast).toHaveBeenLastCalledWith(
        'You have edited since then. Use Undo in the header.',
        'info'
      );
    });

    it('does nothing from a slide toast after a header undo', () => {
      const set = buildSet();
      set.imageUrls = [...set.imageUrls, 'https://example.com/slide-2.png'];
      renderWithToasts({ set });
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Delete slide 1' }));
      const toastUndo = lastToastUndo();
      fireEvent.click(screen.getByTestId('gl-studio-undo'));
      expect(
        screen.getByRole('button', { name: 'Delete slide 2' })
      ).toBeInTheDocument();
      act(() => toastUndo());
      expect(screen.getByLabelText('Activity title')).toHaveValue('Renamed');
      expect(addToast).toHaveBeenLastCalledWith(
        'You have edited since then. Use Undo in the header.',
        'info'
      );
    });

    it('keeps slide delete buttons visible on touch screens', () => {
      renderWithToasts();
      expect(
        screen.getByRole('button', { name: 'Delete slide 1' }).className
      ).toContain('[@media(hover:none)]:opacity-100');
    });

    it('binds the header undo and redo buttons to history', () => {
      renderWithToasts();
      const undoButton = screen.getByTestId('gl-studio-undo');
      const redoButton = screen.getByTestId('gl-studio-redo');
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
      act(() => {
        pressKey(']');
      });
      act(() => {
        pressKey('Delete');
      });
      expect(undoButton).toBeEnabled();
      expect(redoButton).toBeDisabled();
      fireEvent.click(undoButton);
      expect(subtitle()).toHaveTextContent('1 step');
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeEnabled();
      fireEvent.click(redoButton);
      expect(subtitle()).toHaveTextContent('0 steps');
      expect(redoButton).toBeDisabled();
    });
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
    const timeline = screen.getByRole('region', { name: 'Play order' });
    fireEvent.click(within(timeline).getByRole('button', { name: 'Step 1' }));
    expect(screen.queryByTestId('gl-studio-set-settings')).toBeNull();
    expect(screen.getByDisplayValue('Click **Start**')).toBeInTheDocument();
    expect(
      within(timeline).getByRole('button', { name: 'Step 1' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('follows a step to the slide picked in the panel', () => {
    const set = buildSet();
    set.imageUrls = [...set.imageUrls, 'https://example.com/slide-2.png'];
    renderStudio({ set });
    const timeline = screen.getByRole('region', { name: 'Play order' });
    fireEvent.click(within(timeline).getByRole('button', { name: 'Step 1' }));
    fireEvent.change(screen.getByDisplayValue('Slide 1'), {
      target: { value: '1' },
    });
    expect(
      screen.getByRole('button', { name: 'Slide 2, 1 step' })
    ).toHaveAttribute('aria-current', 'true');
    expect(
      within(timeline).getByRole('button', { name: 'Go to slide 2' })
    ).toHaveAttribute('aria-current', 'true');
  });

  it('opens on the step it is given', () => {
    renderStudio({ initialStepId: 'step-1' });
    expect(screen.queryByTestId('gl-studio-set-settings')).toBeNull();
    expect(screen.getByDisplayValue('Click **Start**')).toBeInTheDocument();
  });

  describe('AI drafts to review', () => {
    const draftedSet = (): GuidedLearningSet => {
      const set = buildSet();
      const step = (id: string, text: string, aiDraft: boolean) => ({
        ...set.steps[0],
        id,
        text,
        ...(aiDraft ? { aiDraft: true } : {}),
      });
      set.steps = [
        step('step-1', 'Click **Start**', true),
        step('step-2', 'Plain step', false),
        step('step-3', 'Then press Stop', true),
      ];
      return set;
    };
    const reviewBar = () => screen.getByTestId('gl-studio-ai-drafts');
    const heading = () =>
      screen.getByRole('heading', { level: 2, name: /^Step \d+$/ });

    it('counts drafts in the header and steps through them with next and previous', () => {
      renderStudio({ set: draftedSet() });
      expect(reviewBar()).toHaveTextContent('2 AI drafts to review');
      fireEvent.click(screen.getByRole('button', { name: 'Next AI draft' }));
      expect(heading()).toHaveTextContent('Step 1');
      fireEvent.click(screen.getByRole('button', { name: 'Next AI draft' }));
      expect(heading()).toHaveTextContent('Step 3');
      fireEvent.click(screen.getByRole('button', { name: 'Next AI draft' }));
      expect(heading()).toHaveTextContent('Step 1');
      fireEvent.click(
        screen.getByRole('button', { name: 'Previous AI draft' })
      );
      expect(heading()).toHaveTextContent('Step 3');
    });

    it('clears a step once its text is edited', () => {
      renderStudio({ set: draftedSet(), initialStepId: 'step-1' });
      expect(screen.getByText('AI draft')).toBeInTheDocument();
      fireEvent.change(screen.getByDisplayValue('Click **Start**'), {
        target: { value: 'Press Start' },
      });
      expect(screen.queryByText('AI draft')).toBeNull();
      expect(reviewBar()).toHaveTextContent('1 AI draft to review');
    });

    it('clears a step marked reviewed, saves that, and hides the header when none are left', async () => {
      const { onSave, onClose } = renderStudio({
        set: draftedSet(),
        initialStepId: 'step-1',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next AI draft' }));
      expect(heading()).toHaveTextContent('Step 3');
      fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
      expect(screen.queryByTestId('gl-studio-ai-drafts')).toBeNull();

      // Undo brings the marker back, since review is one history entry.
      fireEvent.click(screen.getByTestId('gl-studio-undo'));
      expect(reviewBar()).toHaveTextContent('1 AI draft to review');
      fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));

      fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      const saved = onSave.mock.calls.at(-1)?.[0] as GuidedLearningSet;
      expect(saved.steps.some((s) => 'aiDraft' in s)).toBe(false);
      expect(saved.steps[0].text).toBe('Click **Start**');
    });

    it('keeps unreviewed drafts marked across a save and reopen', async () => {
      const { onSave, onClose } = renderStudio({ set: draftedSet() });
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value: 'Retitled' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      const saved = onSave.mock.calls.at(-1)?.[0] as GuidedLearningSet;
      expect(saved.steps.filter((s) => s.aiDraft)).toHaveLength(2);
      cleanup();
      renderStudio({ set: saved });
      expect(reviewBar()).toHaveTextContent('2 AI drafts to review');
    });
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
    const timeline = screen.getByRole('region', { name: 'Play order' });
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

    it('closes the Studio and starts the saved draft on the board', async () => {
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
        // The Studio runs the saved draft, not the published snapshot.
        expect(started).toHaveBeenCalledWith({ setId: 'set-1', draft: true });
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

  describe('conflict and schema guards', () => {
    const editTitle = async (value: string) => {
      fireEvent.change(screen.getByLabelText('Activity title'), {
        target: { value },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    };
    const theirs = { ...buildSet(), title: 'Saved in another tab' };
    const secondTabSaved = () =>
      new GuidedLearningSaveConflictError(() =>
        Promise.resolve({ set: theirs, updatedAt: 500 })
      );

    it('pauses autosave behind the banner when another tab saved first', async () => {
      vi.useFakeTimers();
      const onSave = vi.fn<SaveFn>().mockRejectedValue(secondTabSaved());
      renderStudio({ onSave });
      await editTitle('Mine');
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][2]).toEqual({ expectedUpdatedAt: 1 });
      const banner = screen.getByTestId('gl-studio-conflict');
      expect(banner).toHaveTextContent('Edited elsewhere');
      await editTitle('Mine, again');
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('Overwrite saves this draft without the check and resumes autosave', async () => {
      vi.useFakeTimers();
      const onSave = vi
        .fn<SaveFn>()
        .mockRejectedValueOnce(secondTabSaved())
        .mockResolvedValue(undefined);
      renderStudio({ onSave });
      await editTitle('Mine');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][0]).toMatchObject({ title: 'Mine' });
      expect(onSave.mock.calls[1][2]).toEqual({ expectedUpdatedAt: undefined });
      expect(screen.queryByTestId('gl-studio-conflict')).toBeNull();
      await editTitle('Mine, later');
      expect(onSave).toHaveBeenCalledTimes(3);
      expect(onSave.mock.calls[2][2]).toEqual({
        expectedUpdatedAt: onSave.mock.calls[1][0].updatedAt,
      });
    });

    it('Reload swaps in the other tab’s version and saves against its revision', async () => {
      vi.useFakeTimers();
      const onSave = vi
        .fn<SaveFn>()
        .mockRejectedValueOnce(secondTabSaved())
        .mockResolvedValue(undefined);
      renderStudio({ onSave });
      await editTitle('Mine');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByLabelText('Activity title')).toHaveValue(
        'Saved in another tab'
      );
      expect(screen.queryByTestId('gl-studio-conflict')).toBeNull();
      await editTitle('Theirs, edited');
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][2]).toEqual({ expectedUpdatedAt: 500 });
    });

    it('opens a set from a newer schema read-only and never saves it', async () => {
      vi.useFakeTimers();
      const { onSave, onClose } = renderStudio({
        set: { ...buildSet(), schemaVersion: 99 },
      });
      expect(screen.getByTestId('gl-studio-read-only')).toHaveTextContent(
        'saved by a newer version'
      );
      await editTitle('Should not stick');
      expect(screen.getByLabelText('Activity title')).toHaveValue('Timer tour');
      expect(onSave).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onClose).toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
