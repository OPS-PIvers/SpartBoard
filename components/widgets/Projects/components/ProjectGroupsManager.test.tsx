import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  ClassRoster,
  ProjectGroup,
  ProjectGroupImportEntry,
} from '@/types';
import { ProjectGroupsManager } from './ProjectGroupsManager';

const pseudonyms = vi.hoisted(() => ({
  targetRefKeyByStudentUid: new Map<string, string>(),
}));

vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
    targetRefKeyByStudentUid: pseudonyms.targetRefKeyByStudentUid,
    targetRefKeyByAssignmentPseudonym: new Map(),
  }),
}));

const roster = {
  id: 'roster-1',
  name: 'Period 1',
  classlinkClassId: 'class-a',
  students: [
    { id: 's1', firstName: 'Ada', lastName: 'L', classLinkSourcedId: 'sid-1' },
    { id: 's2', firstName: 'Bo', lastName: 'M', classLinkSourcedId: 'sid-2' },
    { id: 's3', firstName: 'Cy', lastName: 'N', classLinkSourcedId: 'sid-3' },
    { id: 's4', firstName: 'Dee', lastName: 'O' },
  ],
} as unknown as ClassRoster;

const group = (
  id: string,
  name: string,
  memberUids: string[],
  order: number
): ProjectGroup => ({
  id,
  name,
  classId: 'class-a',
  memberUids,
  order,
  stepStates: {},
  needsSupport: false,
  workLinks: [],
  updatedAt: 1,
});

const groups = [
  group('g1', 'Otters', ['uid-1'], 0),
  group('g2', 'Herons', ['uid-2'], 1),
];

type SaveFn = (
  classId: string,
  entries: ProjectGroupImportEntry[],
  deleteGroupIds: string[]
) => Promise<void>;

const renderManager = () => {
  const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <ProjectGroupsManager
      isOpen
      projectTitle="Ecosystem poster"
      runId="teacher_project"
      orgId="org"
      rosters={[roster]}
      groups={groups}
      initialRosterId="roster-1"
      onSave={onSave}
      onClose={onClose}
    />
  );
  return { onSave, onClose };
};

const groupCard = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  pseudonyms.targetRefKeyByStudentUid = new Map([
    ['uid-1', 'classlink:sid-1'],
    ['uid-2', 'classlink:sid-2'],
  ]);
});

describe('ProjectGroupsManager', () => {
  it('shows each group with its students and who is ungrouped', () => {
    renderManager();
    expect(within(groupCard('Otters')).getByText('Ada L')).toBeInTheDocument();
    expect(within(groupCard('Herons')).getByText('Bo M')).toBeInTheDocument();
    const pool = groupCard('Not in a group');
    expect(within(pool).getByText('Cy N')).toBeInTheDocument();
    expect(
      within(pool).getByText(/Dee O has no district sign-in/)
    ).toBeInTheDocument();
  });

  it('moves a student by tapping them and then a group', async () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Ada L' }));
    fireEvent.click(
      within(groupCard('Herons')).getByRole('button', { name: /Move here/ })
    );
    expect(within(groupCard('Herons')).getByText('Ada L')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [classId, entries, deleteIds] = onSave.mock.calls[0];
    expect(classId).toBe('class-a');
    expect(deleteIds).toEqual([]);
    expect(entries).toEqual([
      expect.objectContaining({ id: 'g1', classLinkSourcedIds: [] }),
      expect.objectContaining({
        id: 'g2',
        classLinkSourcedIds: ['sid-2', 'sid-1'],
      }),
    ]);
  });

  it('adds an ungrouped student and takes one out', () => {
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Cy N' }));
    fireEvent.click(
      within(groupCard('Otters')).getByRole('button', { name: /Move here/ })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Take Bo M out of Herons' })
    );
    expect(within(groupCard('Otters')).getByText('Cy N')).toBeInTheDocument();
    expect(
      within(groupCard('Not in a group')).getByText('Bo M')
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 groups changed, not saved yet')
    ).toBeInTheDocument();
  });

  it('renames a group and adds a new one', async () => {
    const { onSave } = renderManager();
    fireEvent.change(screen.getByLabelText('Name of Otters'), {
      target: { value: 'Sea Otters' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add group/ }));
    expect(screen.getByLabelText('Name of Group 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const entries = onSave.mock.calls[0][1];
    expect(entries).toEqual([
      expect.objectContaining({ id: 'g1', name: 'Sea Otters' }),
      expect.objectContaining({ name: 'Group 3', order: 2 }),
    ]);
  });

  it('asks before deleting a stored group and deletes it on save', async () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Herons' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Files already saved to your Drive stay there/
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(screen.queryByRole('region', { name: 'Herons' })).toBeNull();
    expect(
      within(groupCard('Not in a group')).getByText('Bo M')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2]).toEqual(['g2']);
  });

  it('spreads ungrouped students across groups', () => {
    renderManager();
    fireEvent.click(
      screen.getByRole('button', { name: /Spread 1 ungrouped student/ })
    );
    expect(within(groupCard('Otters')).getByText('Cy N')).toBeInTheDocument();
    expect(
      within(groupCard('Not in a group')).getByText('Everyone is in a group.')
    ).toBeInTheDocument();
  });

  it('locks the class picker while changes are unsaved, and undo clears them', () => {
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: /Add group/ }));
    expect(screen.getByLabelText('Class')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(screen.getByLabelText('Class')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('holds moves until names load, but keeps unnamed members on save', async () => {
    pseudonyms.targetRefKeyByStudentUid = new Map();
    const { onSave } = renderManager();
    expect(screen.getByText(/Loading student names/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name of Otters'), {
      target: { value: 'Sea Otters' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        id: 'g1',
        classLinkSourcedIds: [],
        keepMemberUids: ['uid-1'],
      }),
    ]);
  });

  it('shows a save failure and stays open', async () => {
    const onSave = vi.fn<SaveFn>().mockRejectedValue(new Error('Network down'));
    const onClose = vi.fn();
    render(
      <ProjectGroupsManager
        isOpen
        projectTitle="Ecosystem poster"
        runId="teacher_project"
        orgId="org"
        rosters={[roster]}
        groups={groups}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add group/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
