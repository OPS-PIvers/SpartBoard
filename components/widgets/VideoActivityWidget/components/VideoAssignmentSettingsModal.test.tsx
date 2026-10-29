import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VideoActivityAssignment } from '@/types';
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';
import { VideoAssignmentSettingsModal } from './VideoAssignmentSettingsModal';

const ASSIGNMENT = {
  id: 'a1',
  activityId: 'v1',
  activityTitle: 'Cell Division Video',
  activityDriveFileId: 'd1',
  teacherUid: 't1',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  rosterIds: [SAMPLE_ROSTERS[0].id],
  sessionSettings: {
    autoPlay: false,
    requireCorrectAnswer: true,
    allowSkipping: false,
  },
  sessionOptions: {
    attemptLimit: 1,
    answerRulesSet: true,
    tabWarningsEnabled: true,
  },
} as VideoActivityAssignment;

const renderModal = (assignment = ASSIGNMENT) => {
  const onSave = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  render(
    <VideoAssignmentSettingsModal
      assignment={assignment}
      rosters={SAMPLE_ROSTERS}
      onClose={onClose}
      onSave={onSave}
    />
  );
  return { onSave, onClose };
};

const stepHeader = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^\\d${name}`) });

describe('VideoAssignmentSettingsModal', () => {
  it('shows When and the rule steps with Save', () => {
    renderModal();
    expect(stepHeader('When')).toBeInTheDocument();
    expect(stepHeader('Attempts and order')).toBeInTheDocument();
    expect(stepHeader('Video')).toBeInTheDocument();
    expect(stepHeader('Integrity')).toBeInTheDocument();
    expect(stepHeader('What students see')).toBeInTheDocument();
    expect(screen.queryByText('Classes')).toBeNull();
  });

  it('closes without a write when nothing changed', async () => {
    const { onSave, onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves only the edited player rule', async () => {
    const { onSave } = renderModal();
    fireEvent.click(stepHeader('Video'));
    fireEvent.click(
      screen.getByRole('switch', { name: /Allow skipping ahead/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]).toEqual([
      {
        sessionSettings: {
          autoPlay: false,
          requireCorrectAnswer: true,
          allowSkipping: true,
        },
      },
    ]);
  });

  it('shows the manual state for a Manual start', () => {
    renderModal({
      ...ASSIGNMENT,
      accessMode: 'assessment',
      periodAccess: { c1: { rosterId: SAMPLE_ROSTERS[0].id, open: false } },
    } as unknown as VideoActivityAssignment);
    fireEvent.click(stepHeader('When'));
    expect(
      screen.getByText('Starts paused. You start and pause each class.')
    ).toBeInTheDocument();
  });
});
