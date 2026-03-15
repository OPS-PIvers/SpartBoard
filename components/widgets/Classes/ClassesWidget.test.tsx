import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import ClassesWidget from './ClassesWidget';
import { useDashboard } from '../../../context/useDashboard';
import { classLinkService } from '../../../utils/classlinkService';

vi.mock('../../../context/useDashboard');
vi.mock('../../../utils/classlinkService');

describe('ClassesWidget RosterEditor', () => {
  const mockAddRoster = vi.fn();
  const mockUpdateRoster = vi.fn();
  const mockDeleteRoster = vi.fn();
  const mockSetActiveRoster = vi.fn();
  const mockAddToast = vi.fn();

  const mockWidget = {
    id: '1',
    type: 'classes' as const,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    z: 1,
    flipped: false,
    config: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as Mock).mockReturnValue({
      rosters: [],
      addRoster: mockAddRoster,
      updateRoster: mockUpdateRoster,
      deleteRoster: mockDeleteRoster,
      setActiveRoster: mockSetActiveRoster,
      addToast: mockAddToast,
      activeRosterId: null,
    });
  });

  it('renders single name field by default', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    // Open add modal
    await user.click(screen.getByRole('button', { name: /create new class/i }));

    expect(screen.getByPlaceholderText(/class name/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/paste full names or group names here/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/first names/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/last names/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\+ add last name/i })
    ).toBeInTheDocument();
  });

  it('toggles to dual name fields', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    expect(
      screen.getByPlaceholderText(/paste first names/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/paste last names/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('saves correctly in single field mode with full names', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    const nameInput = screen.getByPlaceholderText(/class name/i);
    await user.type(nameInput, 'New Class');

    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice Smith\nBob Jones');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockAddRoster).toHaveBeenCalled();
    });

    // In single-field mode, full names go into firstName, lastName is empty
    expect(mockAddRoster).toHaveBeenCalledWith('New Class', [
      expect.objectContaining({ firstName: 'Alice Smith', lastName: '' }),
      expect.objectContaining({ firstName: 'Bob Jones', lastName: '' }),
    ]);
  });

  it('saves correctly in dual field mode', async () => {
    const user = userEvent.setup();
    const existingRoster = {
      id: 'roster-1',
      name: 'Existing Class',
      students: [],
    };
    (useDashboard as Mock).mockReturnValue({
      rosters: [existingRoster],
      addRoster: mockAddRoster,
      updateRoster: mockUpdateRoster,
      deleteRoster: mockDeleteRoster,
    });

    render(<ClassesWidget widget={mockWidget} />);

    // Open edit modal
    await user.click(screen.getByRole('button', { name: /edit class/i }));

    // Toggle to last names
    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    const firstsTextarea = screen.getByPlaceholderText(/paste first names/i);
    await user.clear(firstsTextarea);
    await user.type(firstsTextarea, 'Alice\nBob');

    const lastsTextarea = screen.getByPlaceholderText(/paste last names/i);
    await user.type(lastsTextarea, 'Smith\nJones');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateRoster).toHaveBeenCalled();
    });

    expect(mockUpdateRoster).toHaveBeenCalledWith(
      'roster-1',
      expect.objectContaining({
        name: 'Existing Class',
        students: [
          expect.objectContaining({ firstName: 'Alice', lastName: 'Smith' }),
          expect.objectContaining({ firstName: 'Bob', lastName: 'Jones' }),
        ],
      })
    );
  });

  it('auto-splits names when toggling from single to dual-field mode', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    // Enter full names in single field
    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice Smith\nBob Jones\nCharlie');

    // Toggle to dual-field mode
    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    // Verify names are split
    const firstsTextarea = screen.getByPlaceholderText(/paste first names/i);
    const lastsTextarea = screen.getByPlaceholderText(/paste last names/i);

    expect(firstsTextarea).toHaveValue('Alice\nBob\nCharlie');
    expect(lastsTextarea).toHaveValue('Smith\nJones\n');
  });

  it('merges names when toggling from dual to single-field mode', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    // Toggle to dual-field mode
    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    // Enter separate first and last names
    const firstsTextarea = screen.getByPlaceholderText(/paste first names/i);
    const lastsTextarea = screen.getByPlaceholderText(/paste last names/i);

    await user.type(firstsTextarea, 'Alice\nBob');
    await user.type(lastsTextarea, 'Smith\nJones');

    // Toggle back to single-field mode
    await user.click(screen.getByRole('button', { name: /remove/i }));

    // Verify names are merged
    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    expect(namesTextarea).toHaveValue('Alice Smith\nBob Jones');
  });

  it('preserves data correctly when toggling modes and then saving', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    const nameInput = screen.getByPlaceholderText(/class name/i);
    await user.type(nameInput, 'Test Class');

    // Start with full names
    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice Smith\nBob Jones');

    // Toggle to dual mode (should split)
    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    // Toggle back to single mode (should merge)
    await user.click(screen.getByRole('button', { name: /remove/i }));

    // Save in single mode
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockAddRoster).toHaveBeenCalled();
    });

    // Data should be preserved as full names
    expect(mockAddRoster).toHaveBeenCalledWith('Test Class', [
      expect.objectContaining({ firstName: 'Alice Smith', lastName: '' }),
      expect.objectContaining({ firstName: 'Bob Jones', lastName: '' }),
    ]);
  });

  it('handles names without spaces when toggling to dual mode', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    // Enter names without spaces
    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice\nBob\nCharlie');

    // Toggle to dual-field mode
    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    // Names without spaces should stay in first name field
    const firstsTextarea = screen.getByPlaceholderText(/paste first names/i);
    const lastsTextarea = screen.getByPlaceholderText(/paste last names/i);

    expect(firstsTextarea).toHaveValue('Alice\nBob\nCharlie');
    expect(lastsTextarea).toHaveValue('\n\n');
  });

  it('handles mixed names (some with spaces, some without) when toggling', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    // Mix of full names and single names
    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice Smith\nBob\nCharlie Brown');

    // Toggle to dual-field mode
    await user.click(screen.getByRole('button', { name: /\+ add last name/i }));

    const firstsTextarea = screen.getByPlaceholderText(/paste first names/i);
    const lastsTextarea = screen.getByPlaceholderText(/paste last names/i);

    expect(firstsTextarea).toHaveValue('Alice\nBob\nCharlie');
    expect(lastsTextarea).toHaveValue('Smith\n\nBrown');
  });

  it('renders "No classes yet" when there are no rosters', () => {
    render(<ClassesWidget widget={mockWidget} />);
    expect(screen.getByText(/no classes yet/i)).toBeInTheDocument();
    expect(screen.getByText(/create one to get started/i)).toBeInTheDocument();
  });

  it('allows setting active roster', async () => {
    const user = userEvent.setup();
    (useDashboard as Mock).mockReturnValue({
      rosters: [
        { id: 'r1', name: 'Class 1', students: [] },
        { id: 'r2', name: 'Class 2', students: [] },
      ],
      activeRosterId: 'r1',
      setActiveRoster: mockSetActiveRoster,
    });

    render(<ClassesWidget widget={mockWidget} />);

    // Class 1 is active, clicking it again should toggle it off
    const activeButtons = screen.getAllByRole('button', { name: /active class|set as active/i });
    expect(activeButtons[0]).toHaveAttribute('title', 'Active Class');
    await user.click(activeButtons[0]);
    expect(mockSetActiveRoster).toHaveBeenCalledWith(null);

    // Class 2 is not active, clicking it should toggle it on
    expect(activeButtons[1]).toHaveAttribute('title', 'Set as Active');
    await user.click(activeButtons[1]);
    expect(mockSetActiveRoster).toHaveBeenCalledWith('r2');
  });

  it('handles roster deletion process', async () => {
    const user = userEvent.setup();
    (useDashboard as Mock).mockReturnValue({
      rosters: [{ id: 'roster-1', name: 'Existing Class', students: [] }],
      deleteRoster: mockDeleteRoster,
    });

    render(<ClassesWidget widget={mockWidget} />);

    // Click delete button on roster item
    await user.click(screen.getByRole('button', { name: /delete class/i }));

    // Confirmation dialog should appear
    expect(screen.getByText(/delete roster "existing class"\?/i)).toBeInTheDocument();

    // Cancel deletion
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText(/delete roster "existing class"\?/i)).not.toBeInTheDocument();

    // Trigger delete again and confirm
    await user.click(screen.getByRole('button', { name: /delete class/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i, exact: true }));

    expect(mockDeleteRoster).toHaveBeenCalledWith('roster-1');
  });

  it('fetches classlink rosters, displays empty state if none', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({ classes: [], studentsByClass: {} });

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    // Wait for the classlink view to load
    await waitFor(() => {
      expect(screen.getByText(/no classes found in classlink/i)).toBeInTheDocument();
    });
  });

  it('fetches classlink rosters and allows importing', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({
      classes: [
        { sourcedId: 'c1', title: 'Math 101', subject: 'Math', classCode: 'M101' },
        { sourcedId: 'c2', title: 'No Students Class' }, // Test fallback logic
      ],
      studentsByClass: {
        'c1': [
          { sourcedId: 's1', givenName: 'John', familyName: 'Doe', role: 'student' }
        ],
        // c2 is intentionally missing from studentsByClass to test the fallback `|| []`
      }
    });

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    // Wait for classes to load
    await waitFor(() => {
      expect(screen.getByText(/Math 101/i)).toBeInTheDocument();
      expect(screen.getByText(/1 Students/i)).toBeInTheDocument();
      expect(screen.getByText(/No Students Class/i)).toBeInTheDocument();
    });

    // Import the first class
    const importButtons = screen.getAllByRole('button', { name: /import/i });
    await user.click(importButtons[0]);

    await waitFor(() => {
      expect(mockAddRoster).toHaveBeenCalledWith(
        'Math - Math 101 (M101)',
        [expect.objectContaining({ firstName: 'John', lastName: 'Doe' })]
      );
      expect(mockAddToast).toHaveBeenCalledWith('Imported Math 101', 'success');
    });

    // Open classlink again to import the second class
    await user.click(screen.getByRole('button', { name: /classlink/i }));
    await waitFor(() => {
      expect(screen.getByText(/No Students Class/i)).toBeInTheDocument();
    });

    const secondImportButtons = screen.getAllByRole('button', { name: /import/i });
    await user.click(secondImportButtons[1]);

    await waitFor(() => {
      expect(mockAddRoster).toHaveBeenCalledWith(
        'No Students Class', // No subject or classCode
        [] // empty students array
      );
    });
  });

  it('can back out of roster editing', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    // Open add modal
    await user.click(screen.getByRole('button', { name: /create new class/i }));

    expect(screen.getByPlaceholderText(/class name/i)).toBeInTheDocument();

    // Click back/cancel in the editor
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Should return to list view
    expect(screen.queryByPlaceholderText(/class name/i)).not.toBeInTheDocument();
  });

  it('handles classlink fetch failure', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockRejectedValue(new Error('Network error'));

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Failed to fetch from ClassLink. Check console.', 'error');
      // Should revert to list view
      expect(screen.queryByText(/ClassLink Rosters/i)).not.toBeInTheDocument();
    });
  });

  it('handles classlink import failure', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({
      classes: [{ sourcedId: 'c1', title: 'Math 101' }],
      studentsByClass: { 'c1': [] }
    });
    // Make addRoster throw to simulate failure
    mockAddRoster.mockRejectedValueOnce(new Error('Import failed'));

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    await waitFor(() => {
      expect(screen.getByText(/Math 101/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /import/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Failed to import Math 101', 'error');
    });
  });

  it('can cancel out of classlink view', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({ classes: [], studentsByClass: {} });

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    await waitFor(() => {
      expect(screen.getByText(/ClassLink Rosters/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/ClassLink Rosters/i)).not.toBeInTheDocument();
  });
});
