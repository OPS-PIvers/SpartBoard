import { render, screen, fireEvent, act } from '@testing-library/react';
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

  /**
   * Regression: the classroom menu is portalled to document.body, outside
   * any `.widget` DraggableWindow ancestor. Its Escape handler closed the
   * menu but never called stopPropagation(), so the keydown kept bubbling to
   * DashboardView's global window-level Escape handler, which falls back to
   * minimizing the topmost z-index widget. Net effect: dismissing this menu
   * with Escape during a live session could also silently minimize an
   * unrelated widget on the live board.
   *
   * FIX: the handler now calls event.stopPropagation() before closing,
   * matching the same fix already applied to ActiveClassChip and other
   * portalled popovers for this exact bug class.
   */
  it('stops propagation on Escape so it does not reach window-level handlers', () => {
    renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));
    expect(screen.getByText('Classroom (2)')).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      });

      expect(screen.queryByText('Classroom (2)')).not.toBeInTheDocument();
      // This is the crux of the regression: DashboardView's global Escape
      // handler is a window-level `keydown` listener. If the menu's own
      // handler doesn't stopPropagation, the event still reaches window
      // and DashboardView falls back to minimizing the topmost widget.
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });

  // Regression: the focus-trap effect's stopPropagation() Escape handler is
  // registered on `document` with a dep array of only [showMenu]. Ending a
  // live session (isLive: true -> false) while the menu is open unmounts the
  // popout-menu portal (the render guard also checks `!isLive`) without
  // `showMenu` itself changing, so the effect never re-runs its cleanup and
  // the listener leaks. Before stopPropagation() was added this leak was
  // harmless; after, the stale listener would swallow every future Escape
  // press site-wide, since setShowMenu(false) is a no-op once the popover is
  // already unmounted and stopPropagation() still runs regardless. Fixed by
  // adding `isLive` to the effect's dependency array so ending the session
  // tears down the listener even though `showMenu` never flips back to false.
  it('cleans up the Escape listener when isLive flips to false while the menu is open, so a later Escape still reaches window', () => {
    const { rerender, props } = renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));
    expect(screen.getByText('Classroom (2)')).toBeInTheDocument();

    act(() => {
      rerender(<LiveControl {...props} isLive={false} />);
    });

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);
    try {
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      });
      expect(windowKeydownSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });

  // Regression (#2429 round-2 review): fixing the stale-listener leak above
  // by adding `isLive` to the focus-trap effect's deps left a second bug —
  // showMenu/menuPosition were never reset when isLive went false. The
  // portal unmounts via the render guard (`!isLive` short-circuits it), but
  // showMenu stays true. If a *new* live session starts before the teacher
  // reopens the menu, the render guard passes again, the portal re-mounts
  // at stale coordinates, and the focus-trap effect re-runs — stealing
  // focus with no user gesture. Fixed by resetting both pieces of state via
  // the adjusting-state-while-rendering pattern (LiveControl.tsx:88-95;
  // CLAUDE.md "useEffect is an escape hatch, not a default") — not an
  // effect, which would cost an extra render pass for what's really a
  // render-time prop-change reaction.
  it('does not silently reopen the menu when a new live session starts after the previous one ended while the menu was open', () => {
    const { rerender, props } = renderLiveControl();
    fireEvent.click(screen.getByLabelText(/connected students/));
    expect(screen.getByText('Classroom (2)')).toBeInTheDocument();

    // Session ends while the menu is open.
    act(() => {
      rerender(<LiveControl {...props} isLive={false} />);
    });
    expect(screen.queryByText('Classroom (2)')).not.toBeInTheDocument();

    // A new session starts. Without the fix, showMenu was still `true` from
    // before, so the portal silently re-mounts here.
    act(() => {
      rerender(<LiveControl {...props} isLive={true} />);
    });
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
