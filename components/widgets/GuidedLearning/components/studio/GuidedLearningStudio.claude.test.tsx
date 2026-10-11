import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import type {
  GuidedLearningSaveGuard,
  GuidedLearningStoredRevision,
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

function buildSet(title = 'Cell Parts'): GuidedLearningSet {
  return {
    id: 'set-1',
    schemaVersion: 3,
    title,
    imageUrls: ['https://example.com/slide-1.png'],
    steps: [
      {
        id: 'step-1',
        xPct: 40,
        yPct: 30,
        imageIndex: 0,
        interactionType: 'tooltip',
        showOverlay: 'tooltip',
        label: 'Nucleus',
        text: 'Click **Start**',
      },
    ],
    mode: 'guided',
    createdAt: 1,
    updatedAt: 1,
  };
}

type ToastAction = { label: string; onClick: () => void };
const addToast =
  vi.fn<(message: string, type?: string, action?: ToastAction) => void>();

function renderStudio(
  props: Partial<React.ComponentProps<typeof GuidedLearningStudio>> = {}
) {
  const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
  const value = { addToast } as unknown as DashboardContextValue;
  render(
    <DashboardContext.Provider value={value}>
      <GuidedLearningStudio
        set={buildSet()}
        meta={null}
        onClose={vi.fn()}
        onSave={onSave}
        {...props}
      />
    </DashboardContext.Provider>
  );
  return { onSave: (props.onSave as typeof onSave | undefined) ?? onSave };
}

// A revision watch the test drives by hand.
function manualWatch() {
  let emit: (r: GuidedLearningStoredRevision) => void = () => undefined;
  const watch = (cb: (r: GuidedLearningStoredRevision) => void) => {
    emit = cb;
    return () => undefined;
  };
  const claudeSaved = (updatedAt: number, title = 'Claude version') =>
    act(async () => {
      emit({
        updatedAt,
        byClaude: true,
        loadLatest: () => Promise.resolve({ set: buildSet(title), updatedAt }),
      });
      await vi.advanceTimersByTimeAsync(0);
    });
  return { watch, claudeSaved };
}

const writeText = vi.fn<(text: string) => Promise<void>>();
let restore: (() => void) | null = null;
beforeEach(() => {
  localStorage.clear();
  addToast.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  restore = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  }).restore;
});
afterEach(() => {
  cleanup();
  features.clear();
  restore?.();
  restore = null;
  vi.useRealTimers();
});

const enableConnector = () => {
  features.add('claude-connector');
  features.add('claude-connector-guided-learning');
};

describe('GuidedLearningStudio Copy for Claude', () => {
  it('stays hidden without connector access', () => {
    renderStudio();
    expect(screen.queryByTestId('gl-studio-copy-for-claude')).toBeNull();
  });

  it('saves pending edits, then copies an activity prompt', async () => {
    enableConnector();
    const { onSave } = renderStudio();
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Plant cells' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('gl-studio-copy-for-claude'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('"Plant cells" (set_id: set-1, source: mine)');
    expect(addToast).toHaveBeenLastCalledWith(
      'Saved. Prompt copied for Claude.',
      'success'
    );
  });

  it('copies nothing when the save fails', async () => {
    enableConnector();
    const onSave = vi.fn<SaveFn>().mockRejectedValue(new Error('offline'));
    renderStudio({ onSave });
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Plant cells' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('gl-studio-copy-for-claude'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenLastCalledWith(
      "Couldn't save, so nothing was copied.",
      'error'
    );
  });

  it('copies a slide prompt from the slide menu', async () => {
    enableConnector();
    renderStudio();
    fireEvent.click(screen.getByTestId('gl-studio-slide-menu-0'));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Copy for Claude' })
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('slide 1 of');
    expect(text).toContain('step 1 ("Nucleus")');
    expect(text).toContain('step ids: step-1');
  });
});

describe('GuidedLearningStudio Claude edits while open', () => {
  it('loads a Claude save into a clean editor and Undo puts the draft back', async () => {
    vi.useFakeTimers();
    const { watch, claudeSaved } = manualWatch();
    const { onSave } = renderStudio({ watchRevision: watch });
    await claudeSaved(50);
    expect(screen.getByLabelText('Activity title')).toHaveValue(
      'Claude version'
    );
    const [message, type, action] = addToast.mock.lastCall ?? [];
    expect(message).toBe('Claude updated this activity.');
    expect(type).toBe('info');
    await act(async () => {
      action?.onClick();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'Cell Parts' });
    expect(onSave.mock.calls[0][2]).toEqual({ expectedUpdatedAt: 50 });
    expect(screen.getByLabelText('Activity title')).toHaveValue('Cell Parts');
  });

  it('ignores its own saves', async () => {
    vi.useFakeTimers();
    const { watch, claudeSaved } = manualWatch();
    renderStudio({ watchRevision: watch });
    await claudeSaved(1);
    expect(screen.getByLabelText('Activity title')).toHaveValue('Cell Parts');
    expect(addToast).not.toHaveBeenCalled();
  });

  it('asks before replacing unsaved edits, and Keep mine overwrites', async () => {
    vi.useFakeTimers();
    const { watch, claudeSaved } = manualWatch();
    const { onSave } = renderStudio({ watchRevision: watch });
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Mine' },
    });
    await claudeSaved(50);
    const banner = screen.getByTestId('gl-studio-conflict');
    expect(banner).toHaveTextContent('Claude updated this activity.');
    expect(screen.getByLabelText('Activity title')).toHaveValue('Mine');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'Mine' });
    expect(onSave.mock.calls[0][2]).toEqual({ expectedUpdatedAt: undefined });
    expect(screen.queryByTestId('gl-studio-conflict')).toBeNull();
  });

  it("Load Claude's changes swaps in Claude's version", async () => {
    vi.useFakeTimers();
    const { watch, claudeSaved } = manualWatch();
    renderStudio({ watchRevision: watch });
    fireEvent.change(screen.getByLabelText('Activity title'), {
      target: { value: 'Mine' },
    });
    await claudeSaved(50);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: "Load Claude's changes" })
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText('Activity title')).toHaveValue(
      'Claude version'
    );
    expect(screen.queryByTestId('gl-studio-conflict')).toBeNull();
  });
});
