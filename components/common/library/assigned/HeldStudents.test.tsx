import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const setTime = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/utils/heldStudentTime', () => ({ setHeldStudentTime: setTime }));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    loading: false,
  }),
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ orgId: 'o' }) }));

import { HeldStudentsList } from './HeldStudents';

const HOUR = 3_600_000;
const later = Date.now() + 24 * HOUR;
const hold = {
  until: later + HOUR,
  students: { s1: { from: later, until: later + HOUR } },
};
const names = new Map([['s1', { givenName: 'Cora', familyName: 'Diaz' }]]);
const edit = { teacherUid: 't1', assignmentId: 'a1', hold };

describe('HeldStudentsList', () => {
  it('lists Last, First with no buttons when it cannot edit', () => {
    render(
      <HeldStudentsList
        students={[{ uid: 's1', from: later, until: later + HOUR }]}
        names={names}
      />
    );
    expect(screen.getByText('Diaz, Cora')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('Remove clears that student after the confirm', async () => {
    render(
      <HeldStudentsList
        students={[{ uid: 's1', from: later, until: later + HOUR }]}
        names={names}
        edit={edit}
      />
    );
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() =>
      expect(setTime).toHaveBeenCalledWith('t1', 'a1', hold, 's1', null)
    );
  });

  it('Edit opens the schedule dialog for that student', () => {
    render(
      <HeldStudentsList
        students={[{ uid: 's1', from: later, until: later + HOUR }]}
        names={names}
        edit={edit}
      />
    );
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Schedule Diaz, Cora')).toBeTruthy();
  });
});
