import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserManagementPanel } from '@/components/admin/UserManagement/UserManagementPanel';
import { setDoc } from 'firebase/firestore';

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({
        students: [],
        teachers: [],
        betaTeachers: ['existing@test.com'],
        admins: [],
        superAdmins: [],
      }),
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    doc: vi.fn(),
  };
});

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

describe('UserManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and loads data', async () => {
    render(<UserManagementPanel />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    // Check if the existing data is rendered in the beta teachers textarea
    const betaTextarea = screen.getByLabelText('Teachers (Beta) Emails');
    expect(betaTextarea).toHaveValue('existing@test.com');
  });

  it('parses, deduplicates, and lowercases emails on blur', async () => {
    render(<UserManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    const studentTextarea = screen.getByLabelText('Students Emails');

    // Type mixed case, spaces, newlines, commas, and invalid emails
    fireEvent.change(studentTextarea, {
      target: {
        value:
          ' Test1@example.com , test1@EXAMPLE.COM \n invalid-email \n test2@example.com, , ',
      },
    });

    // Trigger blur to format
    fireEvent.blur(studentTextarea);

    // Verify it was cleaned up and deduplicated
    expect(studentTextarea).toHaveValue('test1@example.com\ntest2@example.com');
  });

  it('enables save button on change and saves to firestore', async () => {
    render(<UserManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeDisabled();

    const adminsTextarea = screen.getByLabelText('Admins Emails');

    fireEvent.change(adminsTextarea, {
      target: { value: 'newadmin@test.com' },
    });
    fireEvent.blur(adminsTextarea);

    // Button should now be enabled
    expect(saveButton).not.toBeDisabled();

    // Click save
    fireEvent.click(saveButton);

    // Verify save happened
    await waitFor(() => {
      expect(setDoc).toHaveBeenCalled();
    });
  });
});
