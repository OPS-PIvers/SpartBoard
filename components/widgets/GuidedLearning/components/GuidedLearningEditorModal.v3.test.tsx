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

const storage = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  deleteDriveFile: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
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
    deleteFile: storage.deleteFile,
    deleteDriveFile: storage.deleteDriveFile,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

// The detail pane stand-in drives the controller the way the Studio will.
vi.mock('./GuidedLearningEditor', () => ({
  GuidedLearningEditorContextPane: () => <div />,
  GuidedLearningEditorDetailPane: ({
    state,
  }: {
    state: import('./useGuidedLearningEditorState').GuidedLearningEditorController;
  }) => (
    <>
      <button
        onClick={() => {
          state.updateStep({ ...state.steps[0], narration: undefined });
          state.queueMediaDeletion({ storagePath: 'narration/take-1.webm' });
        }}
      >
        Drop narration
      </button>
      <button onClick={() => state.undo()}>Undo</button>
      <button
        onClick={() => state.updateStep({ ...state.steps[0], tour: undefined })}
      >
        Drop tour
      </button>
      <button
        onClick={() =>
          state.updateStep({
            ...state.steps[1],
            tour: { anchor: 'sidebar.boards', action: 'observe' },
          })
        }
      >
        Add tour
      </button>
      <button
        onClick={() =>
          state.updateStep({
            ...state.steps[0],
            region: { shape: 'rect', wPct: 30, hPct: 12, cornerPct: 10 },
          })
        }
      >
        Change region
      </button>
    </>
  ),
}));

function buildV3Set(): GuidedLearningSet {
  return {
    id: 'set-v3',
    schemaVersion: 3,
    title: 'Studio Set',
    imageUrls: ['https://example.com/slide-1.png'],
    watchPace: 'calm',
    tourSetup: { widgets: ['time-tool'] },
    steps: [
      {
        id: 'step-1',
        xPct: 40,
        yPct: 30,
        imageIndex: 0,
        interactionType: 'tooltip',
        showOverlay: 'tooltip',
        text: 'Click **Start**',
        region: { shape: 'rect', wPct: 20, hPct: 10, cornerPct: 25 },
        calloutPin: { xPct: 70, yPct: 60 },
        cursor: { hide: true },
        narration: {
          source: 'recorded',
          url: 'https://example.com/take-1.webm',
          storagePath: 'narration/take-1.webm',
          durationMs: 2400,
        },
        tour: { anchor: 'dock.open-tools', action: 'click' },
      },
      {
        id: 'step-2',
        xPct: 60,
        yPct: 50,
        imageIndex: 0,
        interactionType: 'spotlight',
        showOverlay: 'none',
        region: {
          shape: 'polygon',
          wPct: 20,
          hPct: 20,
          points: [
            { x: 50, y: 40 },
            { x: 70, y: 40 },
            { x: 60, y: 60 },
          ],
        },
      },
    ],
    mode: 'guided',
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

const closeEditor = () =>
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Close' }).slice(-1)[0]
  );

beforeEach(() => {
  storage.deleteFile.mockReset().mockResolvedValue(undefined);
  storage.deleteDriveFile.mockReset().mockResolvedValue(undefined);
});

describe('GuidedLearningEditorModal with a v3 set', () => {
  it('keeps every Studio field when the classic editor saves a title edit', async () => {
    const set = buildV3Set();
    const { onSave } = renderModal(set);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Renamed' },
    });
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const saved = onSave.mock.calls[0][0] as GuidedLearningSet;
    expect(saved.title).toBe('Renamed');
    expect(saved.schemaVersion).toBe(3);
    expect(saved.watchPace).toEqual(set.watchPace);
    expect(saved.tourSetup).toEqual(set.tourSetup);
    expect(saved.steps).toEqual(set.steps);
  });

  it('stamps hasLiveTour on building sets as tour steps come and go', async () => {
    const building = { ...buildV3Set(), isBuilding: true };
    const first = renderModal(building);
    fireEvent.click(screen.getByRole('button', { name: 'Drop tour' }));
    closeEditor();
    await waitFor(() => expect(first.onSave).toHaveBeenCalledTimes(1));
    const dropped = first.onSave.mock.calls[0][0] as GuidedLearningSet;
    expect(dropped.hasLiveTour).toBe(false);
    cleanup();

    const second = renderModal({ ...dropped, hasLiveTour: false });
    fireEvent.click(screen.getByRole('button', { name: 'Add tour' }));
    closeEditor();
    await waitFor(() => expect(second.onSave).toHaveBeenCalledTimes(1));
    expect(
      (second.onSave.mock.calls[0][0] as GuidedLearningSet).hasLiveTour
    ).toBe(true);
  });

  it('leaves hasLiveTour off personal sets', async () => {
    const { onSave } = renderModal(buildV3Set());
    fireEvent.click(screen.getByRole('button', { name: 'Change region' }));
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('hasLiveTour');
  });

  it('shows no Studio notice for a set without Studio fields', () => {
    const set = buildV3Set();
    renderModal({
      ...set,
      steps: set.steps.map((s) => ({
        id: s.id,
        xPct: s.xPct,
        yPct: s.yPct,
        imageIndex: s.imageIndex,
        interactionType: s.interactionType,
      })),
    });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('tells the author the set uses Studio features', () => {
    renderModal(buildV3Set());
    expect(screen.getByRole('note')).toHaveTextContent(
      'This activity uses Studio features.'
    );
  });

  it('treats a region-only edit as a change worth saving', async () => {
    const { onSave } = renderModal(buildV3Set());
    fireEvent.click(screen.getByRole('button', { name: 'Change region' }));
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as GuidedLearningSet;
    expect(saved.steps[0].region).toMatchObject({ wPct: 30, cornerPct: 10 });
  });

  it('deletes a queued file after the closing save', async () => {
    const { onSave, onClose } = renderModal(buildV3Set());
    fireEvent.click(screen.getByRole('button', { name: 'Drop narration' }));
    closeEditor();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith(
      'narration/take-1.webm'
    );
  });

  it('keeps a queued file whose edit was undone', async () => {
    const { onClose } = renderModal(buildV3Set());
    fireEvent.click(screen.getByRole('button', { name: 'Drop narration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    closeEditor();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('keeps a queued file when the closing save fails', async () => {
    const { onSave, onClose } = renderModal(buildV3Set());
    onSave.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Drop narration' }));
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
