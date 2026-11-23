import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StudentTours } from './StudentTours';

const h = vi.hoisted(() => ({
  identity: null as { uid: string; orgId: string | null } | null,
  open: false,
}));
vi.mock('./useStudentTourIdentity', () => ({
  useStudentTourIdentity: () => h.identity,
}));
vi.mock('@/hooks/useStudentGrades', () => ({
  useStudentFeatureOpen: (id: string) => id === 'student-live-tours' && h.open,
}));
vi.mock('./StudentTourLayer', () => ({
  default: () => <div data-testid="student-tour-layer" />,
}));

beforeEach(() => {
  h.identity = { uid: 's1', orgId: 'orono' };
  h.open = true;
});

describe('StudentTours', () => {
  it('loads the tour layer for a student once the flag is Public', async () => {
    const { findByTestId } = render(<StudentTours />);
    expect(await findByTestId('student-tour-layer')).toBeTruthy();
  });

  it('loads nothing while the flag is closed', () => {
    h.open = false;
    const { container } = render(<StudentTours />);
    expect(container.innerHTML).toBe('');
  });

  it('loads nothing for anyone who is not a signed-in student', () => {
    h.identity = null;
    const { container } = render(<StudentTours />);
    expect(container.innerHTML).toBe('');
  });
});
