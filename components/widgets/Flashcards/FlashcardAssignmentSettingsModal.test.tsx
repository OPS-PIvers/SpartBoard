import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassRoster, FlashcardAssignment, Plc } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import type { FlashcardAssignmentSettingsPatch } from '@/hooks/useFlashcardAssignments';
import { FlashcardAssignmentSettingsModal } from './FlashcardAssignmentSettingsModal';

const roster = (id: string, name: string): ClassRoster => ({
  id,
  name,
  driveFileId: `f-${id}`,
  studentCount: 1,
  createdAt: 0,
  classlinkClassId: `CL-${id}`,
  students: [],
});
const ROSTERS = [roster('r1', 'Period 1'), roster('r2', 'Period 2')];

const assignment = (
  overrides: Partial<FlashcardAssignment> = {}
): FlashcardAssignment => ({
  id: 'a-1',
  sessionId: 'a-1',
  setId: 'set-1',
  setTitle: 'Spanish verbs',
  teacherUid: 'teacher-1',
  kind: 'check',
  checkMode: 'write',
  status: 'active',
  createdAt: Date.UTC(2026, 10, 1),
  updatedAt: 1,
  rosterIds: ['r1'],
  periodNames: ['Period 1'],
  scoreVisibility: 'score',
  ...overrides,
});

const renderModal = (
  a: FlashcardAssignment,
  extra: Partial<
    React.ComponentProps<typeof FlashcardAssignmentSettingsModal>
  > = {}
) => {
  const onSave = vi.fn((_patch: FlashcardAssignmentSettingsPatch) =>
    Promise.resolve()
  );
  const onClose = vi.fn();
  const auth = {
    user: { uid: 'teacher-1' },
    canAccessFeature: () => false,
  } as unknown as React.ContextType<typeof AuthContext>;
  render(
    <AuthContext.Provider value={auth}>
      <FlashcardAssignmentSettingsModal
        assignment={a}
        rosters={ROSTERS}
        onClose={onClose}
        onSave={onSave}
        {...extra}
      />
    </AuthContext.Provider>
  );
  return { onSave, onClose };
};

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const savedPatch = (onSave: ReturnType<typeof vi.fn>) =>
  onSave.mock.calls[0][0] as FlashcardAssignmentSettingsPatch;

describe('FlashcardAssignmentSettingsModal', () => {
  it('shows Quiz’s Settings steps for a check', () => {
    renderModal(assignment());
    expect(screen.getByText('Classes')).toBeTruthy();
    expect(screen.getByText('When')).toBeTruthy();
    expect(screen.getByText('Attempts and order')).toBeTruthy();
    expect(screen.getByText('Integrity')).toBeTruthy();
    expect(screen.getByText('What students see')).toBeTruthy();
  });

  it('saves nothing but closes when nothing changed', async () => {
    const { onSave, onClose } = renderModal(assignment());
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedPatch(onSave)).toEqual({});
    expect(onClose).toHaveBeenCalled();
  });

  it('saves edited rules with the matching score visibility', async () => {
    const { onSave } = renderModal(assignment());
    fireEvent.click(screen.getByText('Attempts and order'));
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle cards' }));
    fireEvent.click(screen.getByText('What students see'));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Show right and wrong to students' })
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Reveal correct answer to students' })
    );
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = savedPatch(onSave);
    expect(patch.rules?.sessionOptions.shuffleQuestions).toBe(true);
    expect(patch.scoreVisibility).toBe('score-and-answers');
    expect(patch.classEdit).toBeUndefined();
  });

  it('leaves score visibility alone when only other rules change', async () => {
    const { onSave } = renderModal(assignment());
    fireEvent.click(screen.getByText('Attempts and order'));
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle cards' }));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedPatch(onSave)).not.toHaveProperty('scoreVisibility');
  });

  it('keeps a visibility set by Unpublish', async () => {
    const { onSave } = renderModal(
      assignment({
        scoreVisibility: 'none',
        rules: {
          attemptLimit: 1,
          sessionOptions: { showScoreOnSubmit: true },
        },
      })
    );
    fireEvent.click(screen.getByText('What students see'));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Show right and wrong to students' })
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Reveal correct answer to students' })
    );
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedPatch(onSave).rules).toBeDefined();
    expect(savedPatch(onSave)).not.toHaveProperty('scoreVisibility');
  });

  it('retargets the classes through a class edit', async () => {
    const { onSave } = renderModal(assignment());
    fireEvent.click(screen.getByRole('button', { name: 'Period 1' }));
    fireEvent.click(screen.getByLabelText(/Period 2/));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const edit = savedPatch(onSave).classEdit;
    expect(edit?.rosterIds.sort()).toEqual(['r1', 'r2']);
    expect(edit?.classIds.sort()).toEqual(['CL-r1', 'CL-r2']);
    expect(edit?.removedRosterNames).toEqual([]);
  });

  it('gives a study resource no rule steps and no Sharing', () => {
    renderModal(assignment({ kind: 'study' }), { onShareResults: vi.fn() });
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.queryByText('Attempts and order')).toBeNull();
    expect(screen.queryByText('Sharing')).toBeNull();
  });

  it('skips Classes for an individually targeted assignment', () => {
    renderModal(assignment({ targetGroupIds: ['g1'] }));
    expect(screen.queryByText('Classes')).toBeNull();
  });

  it('stops sharing results with the named PLC', () => {
    const onStopSharing = vi.fn();
    renderModal(assignment({ plcShare: { plcId: 'plc-1', sharedAt: 1 } }), {
      plcs: [{ id: 'plc-1', name: 'Spanish PLC' } as Plc],
      onStopSharing,
    });
    expect(screen.getByText('Shared with Spanish PLC')).toBeTruthy();
    fireEvent.click(screen.getByText('Sharing'));
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(onStopSharing).toHaveBeenCalled();
  });

  it('keeps the dialog open when the save fails', async () => {
    const { onSave, onClose } = renderModal(assignment());
    onSave.mockRejectedValueOnce(new Error('nope'));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
