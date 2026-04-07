import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import ClassesWidget from './ClassesWidget';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { classLinkService } from '@/utils/classlinkService';

vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth');
vi.mock('@/utils/classlinkService');

describe('ClassesWidget RosterEditor', () => {
  const defaultAuthMock = {
    featurePermissions: [],
    selectedBuildings: [],
  };

  const defaultDashboardMock = {
    rosters: [] as Record<string, unknown>[],
    addRoster: vi.fn() as Mock,
    updateRoster: vi.fn() as Mock,
    deleteRoster: vi.fn() as Mock,
    setActiveRoster: vi.fn() as Mock,
    addToast: vi.fn() as Mock,
    activeRosterId: null as string | null,
  };

  const mockWidget = {
    id: '1',
    type: 'classes' as const,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    z: 1,
    flipped: false,
    config: { classLinkEnabled: true },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as Mock).mockReturnValue(defaultDashboardMock);
    (useAuth as Mock).mockReturnValue(defaultAuthMock);
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
      screen.getByRole('button', { name: /\+ last name/i })
    ).toBeInTheDocument();
  });

  it('toggles to dual name fields', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

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
      expect(defaultDashboardMock.addRoster).toHaveBeenCalled();
    });

    // In single-field mode, full names go into firstName, lastName is empty
    expect(defaultDashboardMock.addRoster).toHaveBeenCalledWith('New Class', [
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
      ...defaultDashboardMock,
      rosters: [existingRoster],
    });

    render(<ClassesWidget widget={mockWidget} />);

    // Open edit modal
    await user.click(screen.getByRole('button', { name: /edit class/i }));

    // Toggle to last names
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

    const firstsTextarea = screen.getByPlaceholderText(/paste first names/i);
    await user.clear(firstsTextarea);
    await user.type(firstsTextarea, 'Alice\nBob');

    const lastsTextarea = screen.getByPlaceholderText(/paste last names/i);
    await user.type(lastsTextarea, 'Smith\nJones');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(defaultDashboardMock.updateRoster).toHaveBeenCalled();
    });

    expect(defaultDashboardMock.updateRoster).toHaveBeenCalledWith(
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
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

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
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

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
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

    // Toggle back to single mode (should merge)
    await user.click(screen.getByRole('button', { name: /remove/i }));

    // Save in single mode
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(defaultDashboardMock.addRoster).toHaveBeenCalled();
    });

    // Data should be preserved as full names
    expect(defaultDashboardMock.addRoster).toHaveBeenCalledWith('Test Class', [
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
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

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
    await user.click(screen.getByRole('button', { name: /\+ last name/i }));

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
      ...defaultDashboardMock,
      rosters: [
        { id: 'r1', name: 'Class 1', students: [] },
        { id: 'r2', name: 'Class 2', students: [] },
      ],
      activeRosterId: 'r1',
    });

    render(<ClassesWidget widget={mockWidget} />);

    // Class 1 is active, clicking it again should toggle it off
    const class1Text = screen.getByText('Class 1');
    const class1Container = class1Text.closest('div.border.rounded-2xl');
    const class1Button = within(class1Container as HTMLElement).getByRole(
      'button',
      { name: /active class/i }
    );
    expect(class1Button).toHaveAttribute('title', 'Active Class');
    await user.click(class1Button);
    expect(defaultDashboardMock.setActiveRoster).toHaveBeenCalledWith(null);

    // Class 2 is not active, clicking it should toggle it on
    const class2Text = screen.getByText('Class 2');
    const class2Container = class2Text.closest('div.border.rounded-2xl');
    const class2Button = within(class2Container as HTMLElement).getByRole(
      'button',
      { name: /set as active/i }
    );
    expect(class2Button).toHaveAttribute('title', 'Set as Active');
    await user.click(class2Button);
    expect(defaultDashboardMock.setActiveRoster).toHaveBeenCalledWith('r2');
  });

  it('handles roster deletion process', async () => {
    const user = userEvent.setup();
    (useDashboard as Mock).mockReturnValue({
      ...defaultDashboardMock,
      rosters: [{ id: 'roster-1', name: 'Existing Class', students: [] }],
    });

    render(<ClassesWidget widget={mockWidget} />);

    // Click delete button on roster item
    await user.click(screen.getByRole('button', { name: /delete class/i }));

    // Confirmation dialog should appear
    expect(
      screen.getByText(/delete roster "existing class"\?/i)
    ).toBeInTheDocument();

    // Cancel deletion
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(
      screen.queryByText(/delete roster "existing class"\?/i)
    ).not.toBeInTheDocument();

    // Trigger delete again and confirm
    await user.click(screen.getByRole('button', { name: /delete class/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(defaultDashboardMock.deleteRoster).toHaveBeenCalledWith('roster-1');
  });

  it('fetches classlink rosters, displays empty state if none', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({
      classes: [],
      studentsByClass: {},
    });

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    // Wait for the classlink view to load
    await waitFor(() => {
      expect(
        screen.getByText(/no classes found in classlink/i)
      ).toBeInTheDocument();
    });
  });

  it('fetches classlink rosters and allows importing', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({
      classes: [
        {
          sourcedId: 'c1',
          title: 'Math 101',
          subject: 'Math',
          classCode: 'M101',
        },
        { sourcedId: 'c2', title: 'No Students Class' }, // Test fallback logic
      ],
      studentsByClass: {
        c1: [
          {
            sourcedId: 's1',
            givenName: 'John',
            familyName: 'Doe',
            role: 'student',
          },
        ],
        // c2 is intentionally missing from studentsByClass to test the fallback `|| []`
      },
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
    const mathText = screen.getByText('Math 101');
    const class1Container = mathText.closest('div.border.rounded-2xl');
    const class1ImportBtn = within(class1Container as HTMLElement).getByRole(
      'button',
      {
        name: /import/i,
      }
    );
    await user.click(class1ImportBtn);

    await waitFor(() => {
      expect(defaultDashboardMock.addRoster).toHaveBeenCalledWith(
        'Math - Math 101 (M101)',
        [expect.objectContaining({ firstName: 'John', lastName: 'Doe' })]
      );
      expect(defaultDashboardMock.addToast).toHaveBeenCalledWith(
        'Imported Math 101',
        'success'
      );
    });

    // Open classlink again to import the second class
    await user.click(screen.getByRole('button', { name: /classlink/i }));
    await waitFor(() => {
      expect(screen.getByText(/No Students Class/i)).toBeInTheDocument();
    });

    const noStudentsText = screen.getByText('No Students Class');
    const class2Container = noStudentsText.closest('div.border.rounded-2xl');
    const class2ImportBtn = within(class2Container as HTMLElement).getByRole(
      'button',
      {
        name: /import/i,
      }
    );
    await user.click(class2ImportBtn);

    await waitFor(() => {
      expect(defaultDashboardMock.addRoster).toHaveBeenCalledWith(
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
    expect(
      screen.queryByPlaceholderText(/class name/i)
    ).not.toBeInTheDocument();
  });

  it('handles classlink fetch failure', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockRejectedValue(
      new Error('Network error')
    );

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    await waitFor(() => {
      expect(defaultDashboardMock.addToast).toHaveBeenCalledWith(
        'Failed to fetch from ClassLink. Check console.',
        'error'
      );
      // Should revert to list view
      expect(screen.queryByText(/ClassLink Rosters/i)).not.toBeInTheDocument();
    });
  });

  it('handles classlink import failure', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({
      classes: [{ sourcedId: 'c1', title: 'Math 101' }],
      studentsByClass: { c1: [] },
    });
    // Make addRoster throw to simulate failure
    defaultDashboardMock.addRoster.mockRejectedValueOnce(
      new Error('Import failed')
    );

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    await waitFor(() => {
      expect(screen.getByText(/Math 101/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /import/i }));

    await waitFor(() => {
      expect(defaultDashboardMock.addToast).toHaveBeenCalledWith(
        'Failed to import Math 101',
        'error'
      );
    });
  });

  it('can cancel out of classlink view', async () => {
    const user = userEvent.setup();
    (classLinkService.getRosters as Mock).mockResolvedValue({
      classes: [],
      studentsByClass: {},
    });

    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /classlink/i }));

    await waitFor(() => {
      expect(screen.getByText(/ClassLink Rosters/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/ClassLink Rosters/i)).not.toBeInTheDocument();
  });

  it('hides ClassLink button when classLinkEnabled is false in widget config', () => {
    const disabledWidget = {
      ...mockWidget,
      config: { classLinkEnabled: false },
    };
    render(<ClassesWidget widget={disabledWidget} />);

    expect(
      screen.queryByRole('button', { name: /classlink/i })
    ).not.toBeInTheDocument();
  });

  it('hides ClassLink button when classLinkEnabled is false in global auth featurePermissions', () => {
    (useAuth as Mock).mockReturnValue({
      ...defaultAuthMock,
      selectedBuildings: ['building-1'],
      featurePermissions: [
        {
          widgetType: 'classes',
          config: {
            buildingDefaults: {
              'building-1': { classLinkEnabled: false },
            },
          },
        },
      ],
    });

    render(<ClassesWidget widget={mockWidget} />); // widget config implies true

    expect(
      screen.queryByRole('button', { name: /classlink/i })
    ).not.toBeInTheDocument();
  });

  // ─── PIN UI Tests ──────────────────────────────────────────────────────────

  it('shows "+ Quiz PIN" button and toggles PIN column', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    // PIN column not shown by default
    expect(
      screen.queryByPlaceholderText(/01\n02\n03/i)
    ).not.toBeInTheDocument();

    // Toggle PIN column on
    await user.click(screen.getByRole('button', { name: /\+ quiz pin/i }));

    // PIN textarea is now visible
    expect(screen.getByPlaceholderText(/^01/)).toBeInTheDocument();
  });

  it('saves PINs from the PIN column', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    const nameInput = screen.getByPlaceholderText(/class name/i);
    await user.type(nameInput, 'PIN Class');

    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice\nBob');

    // Toggle PIN column and enter PINs
    await user.click(screen.getByRole('button', { name: /\+ quiz pin/i }));
    const pinTextarea = screen.getByPlaceholderText(/^01/);
    await user.type(pinTextarea, 'dragon\n42');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(defaultDashboardMock.addRoster).toHaveBeenCalled();
    });

    expect(defaultDashboardMock.addRoster).toHaveBeenCalledWith('PIN Class', [
      expect.objectContaining({ firstName: 'Alice', pin: 'dragon' }),
      expect.objectContaining({ firstName: 'Bob', pin: '42' }),
    ]);
  });

  it('shows duplicate PIN warning', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    const namesTextarea = screen.getByPlaceholderText(
      /paste full names or group names here/i
    );
    await user.type(namesTextarea, 'Alice\nBob');

    // Toggle PIN column and enter duplicate PINs
    await user.click(screen.getByRole('button', { name: /\+ quiz pin/i }));
    const pinTextarea = screen.getByPlaceholderText(/^01/);
    await user.type(pinTextarea, 'same\nsame');

    await waitFor(() => {
      expect(screen.getByText(/duplicate pins/i)).toBeInTheDocument();
    });
  });

  it('hides PIN column when Hide button is clicked', async () => {
    const user = userEvent.setup();
    render(<ClassesWidget widget={mockWidget} />);

    await user.click(screen.getByRole('button', { name: /create new class/i }));

    // Toggle PIN column on
    await user.click(screen.getByRole('button', { name: /\+ quiz pin/i }));
    expect(screen.getByPlaceholderText(/^01/)).toBeInTheDocument();

    // Toggle it off via "Hide" button
    await user.click(screen.getByRole('button', { name: /hide/i }));
    expect(screen.queryByPlaceholderText(/^01/)).not.toBeInTheDocument();
  });
});
