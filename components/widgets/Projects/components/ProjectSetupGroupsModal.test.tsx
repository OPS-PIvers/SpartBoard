import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ClassRoster,
  ProjectDefinition,
  ProjectGroupImportEntry,
  ProjectsPendingImport,
} from '@/types';
import { ProjectSetupGroupsModal } from './ProjectSetupGroupsModal';

const project: ProjectDefinition = {
  id: 'project-1',
  title: 'Ecosystem poster',
  steps: [{ id: 'step-1', title: 'Research' }],
  createdAt: 1,
  updatedAt: 1,
};

const classLinkRoster = {
  id: 'roster-1',
  name: 'Period 1',
  classlinkClassId: 'class-a',
  students: [
    { id: 's1', firstName: 'Ada', lastName: 'L', classLinkSourcedId: 'sid-1' },
    { id: 's2', firstName: 'Bo', lastName: 'M', classLinkSourcedId: 'sid-2' },
    { id: 's3', firstName: 'Cy', lastName: 'N' },
  ],
} as unknown as ClassRoster;

const handBuiltRoster = {
  id: 'roster-2',
  name: 'Robotics Club',
  students: [],
} as unknown as ClassRoster;

const pending: ProjectsPendingImport = {
  rosterId: 'roster-1',
  at: 1,
  groups: [
    { name: 'Team Otter', studentIds: ['s1', 's2'] },
    { name: 'Team Heron', studentIds: ['s3'] },
  ],
};

const renderModal = (
  props: Partial<React.ComponentProps<typeof ProjectSetupGroupsModal>> = {}
) => {
  const onCommit = vi
    .fn()
    .mockResolvedValue({ groupsWritten: 2, membersResolved: 2 });
  render(
    <ProjectSetupGroupsModal
      isOpen
      project={project}
      rosters={[classLinkRoster, handBuiltRoster]}
      existingGroups={[]}
      pendingImport={null}
      onCommit={onCommit}
      onClose={vi.fn()}
      {...props}
    />
  );
  return onCommit;
};

const committed = (onCommit: ReturnType<typeof vi.fn>) =>
  onCommit.mock.calls[0][0] as ProjectGroupImportEntry[];

describe('ProjectSetupGroupsModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates hand-named groups when nothing was pushed over', async () => {
    const onCommit = renderModal();
    fireEvent.change(screen.getByLabelText('How many groups?'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add 3 groups' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    const entries = committed(onCommit);
    expect(entries.map((e) => e.name)).toEqual([
      'Group 1',
      'Group 2',
      'Group 3',
    ]);
    expect(entries.every((e) => e.classId === 'class-a')).toBe(true);
    expect(entries.every((e) => e.classLinkSourcedIds.length === 0)).toBe(true);
  });

  // D8 — the client resolves Student.id → sourcedId; the callable does the HMAC.
  it('resolves a Group Maker push to ClassLink sourcedIds', async () => {
    const onCommit = renderModal({ pendingImport: pending });
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 groups' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    const entries = committed(onCommit);
    expect(entries[0].classLinkSourcedIds).toEqual(['sid-1', 'sid-2']);
    // Cy has no district account, so nothing of theirs leaves the client.
    expect(entries[1].classLinkSourcedIds).toEqual([]);
  });

  it('names a student with no district account rather than dropping them silently', () => {
    renderModal({ pendingImport: pending });
    expect(screen.getByText(/Cy N/)).toBeInTheDocument();
  });

  // D11 — a Group Maker name must never reach a projected face by default.
  it('numbers groups by default and carries their names only on request', async () => {
    const onCommit = renderModal({ pendingImport: pending });
    expect(screen.getByText('Group 1')).toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText(/Use the Group Maker's own group names/)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 groups' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(committed(onCommit).map((e) => e.name)).toEqual([
      'Team Otter',
      'Team Heron',
    ]);
  });

  // D6 — a class with no ClassLink roster is a teacher-only tracker, and says so.
  it('warns that a hand-built roster has no student side', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Class'), {
      target: { value: 'roster-2' },
    });
    expect(
      screen.getByText(/no district account to sign in with/)
    ).toBeInTheDocument();
  });

  // D9 — a re-import lands alongside tracked work, never on top of it.
  it('numbers and orders new groups after the ones already in the class', async () => {
    const onCommit = renderModal({
      existingGroups: [
        { id: 'g1', name: 'Group 1', classId: 'class-a', order: 0 },
        { id: 'g2', name: 'Group 2', classId: 'class-a', order: 1 },
      ] as never,
    });
    fireEvent.change(screen.getByLabelText('How many groups?'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 groups' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    const entries = committed(onCommit);
    expect(entries.map((e) => e.name)).toEqual(['Group 3', 'Group 4']);
    expect(entries.map((e) => e.order)).toEqual([2, 3]);
  });

  it('refuses to push a class past the group ceiling', () => {
    renderModal({
      existingGroups: Array.from({ length: 31 }, (_, i) => ({
        id: `g${i}`,
        name: `Group ${i}`,
        classId: 'class-a',
        order: i,
      })) as never,
    });
    fireEvent.change(screen.getByLabelText('How many groups?'), {
      target: { value: '4' },
    });
    expect(screen.getByRole('button', { name: 'Add 4 groups' })).toBeDisabled();
    expect(screen.getByText(/over 32 groups/)).toBeInTheDocument();
  });
});
