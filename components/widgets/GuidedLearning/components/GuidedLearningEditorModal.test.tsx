/**
 * Focused regression tests for GuidedLearningEditorModal's dirty-state and
 * save-payload computation. As of the double-commit-per-keystroke perf fix,
 * the modal reads the editor controller's fields directly (the hook lives
 * inside the modal) instead of mirroring them via an onStateChange echo, so
 * these tests pin the behavior that must not drift:
 *   - isDirty is equality-based (reverting an edit makes the modal clean
 *     again), which drives the unsaved-changes guard on close
 *   - the saved set is built field-for-field from the live draft, with
 *     default-valued optional fields omitted from the payload
 */

import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { GuidedLearningEditorModal } from './GuidedLearningEditorModal';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user', displayName: 'Test Teacher' },
    isAdmin: false,
    canAccessFeature: () => false,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
  }),
}));

// Pane stand-ins: the context pane optionally simulates a canvas measurement
// (driving the load-time legacy radius conversion) and exposes the
// spotlightRadiiV2 flag the real preview gates on; the detail pane exposes a
// radius-edit button. The real panes are exercised elsewhere.
const paneConfig = vi.hoisted(() => ({
  measure: null as {
    containerWidth: number;
    containerHeight: number;
    naturalDims: [string, { width: number; height: number }][];
  } | null,
}));
vi.mock('./GuidedLearningEditor', () => ({
  GuidedLearningEditorContextPane: ({
    state,
  }: {
    state: import('./useGuidedLearningEditorState').GuidedLearningEditorController;
  }) => {
    React.useEffect(() => {
      if (!paneConfig.measure) return;
      state.canvasMeasurementsRef.current = {
        containerWidth: paneConfig.measure.containerWidth,
        containerHeight: paneConfig.measure.containerHeight,
        naturalDims: new Map(paneConfig.measure.naturalDims),
      };
      state.notifyCanvasMeasured();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="radii-v2">{String(state.spotlightRadiiV2)}</div>;
  },
  GuidedLearningEditorDetailPane: ({
    state,
  }: {
    state: import('./useGuidedLearningEditorState').GuidedLearningEditorController;
  }) => (
    <button
      onClick={() =>
        state.updateStep({ ...state.steps[0], spotlightRadius: 40 })
      }
    >
      Set Radius 40
    </button>
  ),
}));

// Override the global useDialog mock with a controllable showConfirm so the
// unsaved-changes guard is observable (default global mock auto-confirms).
const { showConfirmMock } = vi.hoisted(() => ({
  showConfirmMock: vi.fn(),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: showConfirmMock,
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function buildSet(): GuidedLearningSet {
  return {
    id: 'set-1',
    title: 'Original Title',
    imageUrls: ['https://example.com/slide-1.png'],
    steps: [
      {
        id: 'step-1',
        xPct: 10,
        yPct: 20,
        imageIndex: 0,
        interactionType: 'text-popover',
        showOverlay: 'none',
        text: 'Step text',
      },
    ],
    mode: 'structured',
    createdAt: 1000,
    updatedAt: 2000,
  };
}

function renderModal(set: GuidedLearningSet) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <GuidedLearningEditorModal
      isOpen
      set={set}
      meta={null}
      onClose={onClose}
      onSave={onSave}
    />
  );
  return { onClose, onSave };
}

beforeEach(() => {
  showConfirmMock.mockReset().mockResolvedValue(false);
  paneConfig.measure = null;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GuidedLearningEditorModal dirty state', () => {
  it('closes without a discard prompt when nothing was edited', async () => {
    const { onClose } = renderModal(buildSet());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(showConfirmMock).not.toHaveBeenCalled();
  });

  it('prompts on close after an edit, and is clean again after reverting it', async () => {
    const { onClose } = renderModal(buildSet());
    const titleInput = screen.getByLabelText('Title');

    // Edit → dirty → close is guarded (showConfirm resolves false = keep editing).
    fireEvent.change(titleInput, { target: { value: 'Original Title!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(showConfirmMock).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    // Revert to the original value → equality-based isDirty goes clean →
    // close proceeds without another prompt.
    fireEvent.change(titleInput, { target: { value: 'Original Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(showConfirmMock).toHaveBeenCalledTimes(1);
  });
});

describe('GuidedLearningEditorModal save payload', () => {
  it('builds the saved set from the draft, omitting default-valued optional fields', async () => {
    const set = buildSet();
    const { onSave, onClose } = renderModal(set);

    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const [saved, driveFileId] = onSave.mock.calls[0] as [
      GuidedLearningSet,
      string | undefined,
    ];
    expect(driveFileId).toBeUndefined();
    // Optional fields at their defaults (imageKinds, videoTrims,
    // hotspotPulse, imageTransition, welcome*) must NOT appear at all.
    expect(Object.keys(saved).sort()).toEqual(
      [
        'authorUid',
        'createdAt',
        'description',
        'id',
        'imageUrls',
        'isBuilding',
        'mode',
        'schemaVersion',
        'steps',
        'title',
        'updatedAt',
      ].sort()
    );
    expect(saved).toMatchObject({
      id: 'set-1',
      title: 'Original Title',
      description: undefined,
      imageUrls: set.imageUrls,
      steps: set.steps,
      mode: 'structured',
      createdAt: 1000,
      schemaVersion: 2,
    });
    expect(typeof saved.updatedAt).toBe('number');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('converts legacy spotlight radii once at load and saves them without re-converting', async () => {
    // 200x100 image in a 500x500 canvas → footprint 500x250 → factor 2.
    paneConfig.measure = {
      containerWidth: 500,
      containerHeight: 500,
      naturalDims: [
        ['https://example.com/slide-1.png', { width: 200, height: 100 }],
      ],
    };
    const set = buildSet();
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
    const { onSave } = renderModal(set);

    // Conversion happens at load (flag flips), not at save.
    await waitFor(() =>
      expect(screen.getByTestId('radii-v2')).toHaveTextContent('true')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [saved] = onSave.mock.calls[0] as [GuidedLearningSet];
    expect(saved.schemaVersion).toBe(2);
    expect(saved.steps[0].spotlightRadius).toBe(50);

    // Double-save idempotency: re-opening the converted set and saving again
    // must not convert a second time.
    cleanup();
    const { onSave: onSaveAgain } = renderModal(saved);
    await waitFor(() =>
      expect(screen.getByTestId('radii-v2')).toHaveTextContent('true')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));
    await waitFor(() => expect(onSaveAgain).toHaveBeenCalledTimes(1));
    const [resaved] = onSaveAgain.mock.calls[0] as [GuidedLearningSet];
    expect(resaved.schemaVersion).toBe(2);
    expect(resaved.steps[0].spotlightRadius).toBe(50);
  });

  it('does not convert a radius edited after the load-time conversion', async () => {
    paneConfig.measure = {
      containerWidth: 500,
      containerHeight: 500,
      naturalDims: [
        ['https://example.com/slide-1.png', { width: 200, height: 100 }],
      ],
    };
    const set = buildSet();
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
    const { onSave } = renderModal(set);

    await waitFor(() =>
      expect(screen.getByTestId('radii-v2')).toHaveTextContent('true')
    );
    // Post-conversion edit is already image-relative; save must keep it as-is.
    fireEvent.click(screen.getByRole('button', { name: 'Set Radius 40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [saved] = onSave.mock.calls[0] as [GuidedLearningSet];
    expect(saved.schemaVersion).toBe(2);
    expect(saved.steps[0].spotlightRadius).toBe(40);
  });

  it('keeps a legacy set on legacy semantics when a spotlight step slide is unmeasured', async () => {
    const set = buildSet();
    set.steps = [
      {
        id: 'step-1',
        xPct: 10,
        yPct: 20,
        imageIndex: 0,
        interactionType: 'spotlight',
        showOverlay: 'none',
        spotlightRadius: 30,
      },
    ];
    const { onSave } = renderModal(set);

    // Panes are mocked out, so the canvas never measures — the one-time
    // radius conversion is impossible and v2 must NOT be stamped.
    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [saved] = onSave.mock.calls[0] as [GuidedLearningSet];
    expect('schemaVersion' in saved).toBe(false);
    expect(saved.steps[0].spotlightRadius).toBe(30);
    // The preview gate stays legacy for the whole session.
    expect(screen.getByTestId('radii-v2')).toHaveTextContent('false');
  });

  it('re-stamps an already-v2 set without touching radii', async () => {
    const set = { ...buildSet(), schemaVersion: 2 };
    set.steps = [
      {
        id: 'step-1',
        xPct: 10,
        yPct: 20,
        imageIndex: 0,
        interactionType: 'spotlight',
        showOverlay: 'none',
        spotlightRadius: 40,
      },
    ];
    const { onSave } = renderModal(set);

    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [saved] = onSave.mock.calls[0] as [GuidedLearningSet];
    expect(saved.schemaVersion).toBe(2);
    expect(saved.steps[0].spotlightRadius).toBe(40);
  });

  it('saves the live (trimmed) title after an edit', async () => {
    const { onSave } = renderModal(buildSet());

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: '  Renamed Set  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Set' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [saved] = onSave.mock.calls[0] as [GuidedLearningSet];
    expect(saved.title).toBe('Renamed Set');
  });
});
