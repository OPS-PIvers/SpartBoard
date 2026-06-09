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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// The panes are exercised elsewhere (GuidedLearningPlayer.test.tsx and the
// perf harness); here we only test the modal's own dirty/save logic.
vi.mock('./GuidedLearningEditor', () => ({
  GuidedLearningEditorContextPane: () => null,
  GuidedLearningEditorDetailPane: () => null,
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
    });
    expect(typeof saved.updatedAt).toBe('number');
    expect(onClose).toHaveBeenCalledTimes(1);
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
