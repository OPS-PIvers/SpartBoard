import { render, screen, fireEvent } from '@testing-library/react';
import { LiveControl } from '@/components/widgets/LiveControl';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LiveStudent } from '@/types';

// Helper to render component with common props
const renderLiveControl = (overrides = {}) => {
  const defaultProps = {
    isLive: true, // Default to live so we can see the menu button
    studentCount: 2,
    students: [
      { id: 's1', pin: '01', status: 'active', joinedAt: 0, lastActive: 0 },
      { id: 's2', pin: '02', status: 'frozen', joinedAt: 0, lastActive: 0 },
    ] as LiveStudent[],
    code: 'ABC-123',
    joinUrl: 'https://app.school.com/join',
    onToggleLive: vi.fn(),
    onFreezeStudent: vi.fn(),
    onRemoveStudent: vi.fn(),
    onFreezeAll: vi.fn(),
  };

  const props = { ...defaultProps, ...overrides };
  return {
    ...render(<LiveControl {...props} />),
    props,
  };
};

describe('LiveControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders cast button without dark background when not live', () => {
    renderLiveControl({ isLive: false });
    const button = screen.getByLabelText('Start live session');
    expect(button.className).not.toContain('bg-slate-950/40');
    expect(button.className).toContain('hover:bg-slate-800/10');

    // Menu button should not be visible
    expect(
      screen.queryByLabelText(/connected student/)
    ).not.toBeInTheDocument();
  });

  it('renders cast button with red background when live', () => {
    renderLiveControl({ isLive: true });
    const button = screen.getByLabelText('End live session');
    expect(button.className).toContain('bg-red-500');

    // Menu button should be visible
    expect(screen.getByLabelText(/connected students/)).toBeInTheDocument();
  });

  it('toggles live session when cast button is clicked', () => {
    const { props } = renderLiveControl({ isLive: false });
    const button = screen.getByLabelText('Start live session');
    fireEvent.click(button);
    expect(props.onToggleLive).toHaveBeenCalledTimes(1);
  });

  it('opens menu when student count button is clicked', () => {
    renderLiveControl();
    const menuButton = screen.getByLabelText(/connected students/);

    // Menu should initially be hidden
    expect(screen.queryByText('Classroom (2)')).not.toBeInTheDocument();

    fireEvent.click(menuButton);

    // Menu content (portal) should now be visible
    expect(screen.getByText('Classroom (2)')).toBeInTheDocument();
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
    expect(screen.getByText('app.school.com/join')).toBeInTheDocument();
  });

  it('renders student list correctly in menu', () => {
    renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));

    // Students are now identified by PIN, not name
    expect(screen.getByText(/PIN 01/)).toBeInTheDocument();
    expect(screen.getByText(/PIN 02/)).toBeInTheDocument();

    // Verify status indicators — PIN 02 (frozen) should have line-through
    const pin02 = screen.getByText(/PIN 02/);
    expect(pin02.className).toContain('line-through');

    const pin01 = screen.getByText(/PIN 01/);
    expect(pin01.className).not.toContain('line-through');
  });

  it('calls onFreezeStudent when freeze button is clicked', () => {
    const { props } = renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));

    const freezeBtn = screen.getByLabelText('Freeze PIN 01');
    fireEvent.click(freezeBtn);

    expect(props.onFreezeStudent).toHaveBeenCalledWith('s1', 'active');
  });

  it('calls onFreezeStudent (unfreeze) when unfreeze button is clicked', () => {
    const { props } = renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));

    const unfreezeBtn = screen.getByLabelText('Unfreeze PIN 02');
    fireEvent.click(unfreezeBtn);

    expect(props.onFreezeStudent).toHaveBeenCalledWith('s2', 'frozen');
  });

  it('calls onRemoveStudent when trash button is clicked', () => {
    const { props } = renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));

    const removeBtn = screen.getByLabelText('Remove PIN 01');
    fireEvent.click(removeBtn);

    expect(props.onRemoveStudent).toHaveBeenCalledWith('s1');
  });

  it('calls onFreezeAll when "Freeze / Unfreeze All" is clicked', () => {
    const { props } = renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));

    // Accessible name is set via aria-label to "Freeze all students" (or "Unfreeze...")
    const freezeAllBtn = screen.getByRole('button', {
      name: /Freeze all students/i,
    });
    fireEvent.click(freezeAllBtn);

    expect(props.onFreezeAll).toHaveBeenCalledTimes(1);
  });

  it('closes menu when X button is clicked', () => {
    renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));
    expect(screen.getByText('Classroom (2)')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close menu');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Classroom (2)')).not.toBeInTheDocument();
  });

  it('closes menu when pressing Escape', () => {
    renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));
    expect(screen.getByText('Classroom (2)')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Classroom (2)')).not.toBeInTheDocument();
  });

  it('renders Preview link with preview=1 appended when joinUrl is present', () => {
    renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));

    const previewLink = screen.getByRole('link', { name: /preview/i });
    expect(previewLink).toBeInTheDocument();
    expect(previewLink).toHaveAttribute(
      'href',
      'https://app.school.com/join?preview=1'
    );
    // Plain joinUrl text is shown unchanged elsewhere in the menu.
    expect(screen.getByText('app.school.com/join')).toBeInTheDocument();
  });

  it('does not render the Preview link when joinUrl is absent', () => {
    renderLiveControl({ joinUrl: undefined });
    fireEvent.click(screen.getByLabelText(/connected students/));

    expect(
      screen.queryByRole('link', { name: /preview/i })
    ).not.toBeInTheDocument();
  });
});
