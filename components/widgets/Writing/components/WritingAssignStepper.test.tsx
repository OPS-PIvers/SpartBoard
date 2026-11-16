import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassRoster, WritingAssignmentDefinition } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import type { WritingAssignSubmission } from '@/utils/writingAssign';
import { WritingAssignStepper } from './WritingAssignStepper';

const roster = (id: string, name: string): ClassRoster => ({
  id,
  name,
  driveFileId: `f-${id}`,
  studentCount: 1,
  createdAt: 0,
  classlinkClassId: `CL-${id}`,
  students: [
    {
      id: `${id}-a`,
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: `SID-${id}-a`,
    },
  ],
});

const ITEM: WritingAssignmentDefinition = {
  id: 'w1',
  title: 'Argument essay',
  prompt: 'Is homework worth it?',
  grading: { mode: 'ungraded' },
  createdAt: 0,
  updatedAt: 0,
};

const renderStepper = () => {
  const onAssign = vi.fn((_s: WritingAssignSubmission) => Promise.resolve(true));
  const auth = {
    user: { uid: 'teacher-1' },
    canAccessFeature: () => false,
  } as unknown as React.ContextType<typeof AuthContext>;
  render(
    <AuthContext.Provider value={auth}>
      <WritingAssignStepper
        isOpen
        item={ITEM}
        rosters={[roster('r1', 'Period 1'), roster('r2', 'Period 2')]}
        onClose={vi.fn()}
        onAssign={onAssign}
      />
    </AuthContext.Provider>
  );
  return { onAssign };
};

describe('WritingAssignStepper', () => {
  it('shows the Writing steps and waits for a ClassLink class', () => {
    renderStepper();
    for (const title of ['Classes', 'When', 'Writing rules', 'Integrity'])
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
  });

  it('assigns with the plan defaults: paste off, notice on, record hidden, spell check on', async () => {
    const { onAssign } = renderStepper();
    fireEvent.click(screen.getByRole('checkbox', { name: /Period 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const { input } = onAssign.mock.calls[0][0];
    expect(input).toMatchObject({
      itemId: 'w1',
      classIds: ['CL-r1'],
      allowPaste: false,
      recordingNotice: true,
      studentCanViewRecord: false,
      spellCheck: true,
      tabWarningsEnabled: true,
    });
    expect(input).not.toHaveProperty('timeLimitMinutes');
    expect(input).not.toHaveProperty('focusLevel');
  });
});
