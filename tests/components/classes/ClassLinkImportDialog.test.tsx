import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRosters = vi.fn();
const getDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => getDocs(...args) as unknown,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/classlinkService', () => ({
  classLinkService: {
    getRosters: (...args: unknown[]) => getRosters(...args) as unknown,
  },
}));
vi.mock('@/utils/testClassAccess', () => ({ canReadTestClasses: () => true }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@example.org' },
    userRoles: null,
    orgId: 'org-1',
    roleId: 'super_admin',
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    addToast: vi.fn(),
  }),
}));

import { ClassLinkImportDialog } from '@/components/classes/ClassLinkImportDialog';

const testClassSnap = {
  docs: [
    {
      id: 'mock-period-1',
      data: () => ({
        title: 'Mock Period 1',
        memberEmails: ['s1@example.org'],
      }),
    },
  ],
};

describe('ClassLinkImportDialog', () => {
  beforeEach(() => {
    getRosters.mockReset();
    getDocs.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('still lists admin test classes when ClassLink fails', async () => {
    getRosters.mockRejectedValue(new Error('ClassLink unavailable'));
    getDocs.mockResolvedValue(testClassSnap);

    render(
      <ClassLinkImportDialog isOpen mode={{ kind: 'new' }} onClose={vi.fn()} />
    );

    expect(await screen.findByText('Mock Period 1 (test)')).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to fetch from ClassLink/)
    ).not.toBeInTheDocument();
  });

  it('shows the fetch error when ClassLink fails and there are no test classes', async () => {
    getRosters.mockRejectedValue(new Error('ClassLink unavailable'));
    getDocs.mockResolvedValue({ docs: [] });

    render(
      <ClassLinkImportDialog isOpen mode={{ kind: 'new' }} onClose={vi.fn()} />
    );

    expect(
      await screen.findByText(/Failed to fetch from ClassLink/)
    ).toBeInTheDocument();
  });
});
