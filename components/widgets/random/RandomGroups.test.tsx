/**
 * Regression tests for RandomGroups / GroupDropZone.
 *
 * Bug: onBlur/Escape stale-closure in group rename input
 * -------------------------------------------------------
 * When the user pressed Escape to cancel a group rename, React queued the
 * state updates from cancel() (setEditingName(false), setDraft(groupName))
 * but the DOM blur event fired synchronously BEFORE those updates were
 * applied.  The onBlur={commit} handler ran with a stale draft closure that
 * still held the edited text, so pressing Escape persisted the value the
 * user intended to discard.
 *
 * Fix: `cancelledRef.current = true` is set at the very start of cancel()
 * (a ref write, synchronous and immediate), and commit() bails out early
 * when it sees that flag.
 */

import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RandomGroups } from './RandomGroups';
import type { RandomGroup } from '@/types';

// dnd-kit needs minimal stubs so components render without a real drag context.
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const makeGroups = (data: Record<string, string[]>): RandomGroup[] =>
  Object.entries(data).map(([id, names]) => ({ id, names }));

describe('GroupDropZone — rename input', () => {
  const groups = makeGroups({ g1: ['Alice', 'Bob'], g2: ['Carol'] });
  const sharedGroups = [{ id: 'g1', name: 'Team Alpha', color: null }];

  let onRenameGroup: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onRenameGroup = vi.fn();
  });

  function renderEditable(extraProps = {}) {
    return render(
      <RandomGroups
        displayResult={groups}
        sharedGroups={sharedGroups}
        editable
        onRenameGroup={onRenameGroup}
        onToggleLock={vi.fn()}
        {...extraProps}
      />
    );
  }

  it('renders the group name and pencil icon', () => {
    renderEditable();
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
  });

  it('opens the rename input when the pencil button is clicked', () => {
    renderEditable();
    const pencil = screen.getByRole('button', { name: /Rename Team Alpha/i });
    fireEvent.click(pencil);
    expect(
      screen.getByRole('textbox', { name: /Rename Team Alpha/i })
    ).toBeInTheDocument();
  });

  it('commits the new name on Enter', () => {
    renderEditable();
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    const input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });
    fireEvent.change(input, { target: { value: 'Team Beta' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Team Beta');
  });

  it('commits the new name on blur (without cancel)', () => {
    renderEditable();
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    const input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });
    fireEvent.change(input, { target: { value: 'Team Gamma' } });
    fireEvent.blur(input);
    expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Team Gamma');
  });

  // ─── Regression: Escape + onBlur stale-closure ────────────────────────────
  //
  // BEFORE the fix:
  //   1. User types "Bad Name" into the input.
  //   2. User presses Escape (intending to cancel).
  //   3. cancel() queues state updates (setEditingName(false), setDraft(orig)).
  //   4. Removing focus from the now-unmounting input fires a synchronous blur.
  //   5. onBlur={commit} fires — draft closure still holds "Bad Name" (state
  //      not yet flushed) → onRenameGroup("g1", "Bad Name") is called. WRONG.
  //
  // AFTER the fix:
  //   cancel() sets cancelledRef.current = true synchronously before touching
  //   state. commit() checks this flag first and returns early, so the blur
  //   that fires during unmount is a no-op. onRenameGroup is never called.
  it('REGRESSION: does NOT call onRenameGroup when Escape is pressed to cancel a rename', () => {
    renderEditable();

    // Open the rename input.
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    const input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });

    // Type a new (unwanted) name.
    fireEvent.change(input, { target: { value: 'Unwanted Name' } });

    // Simulate the browser's Escape-then-blur sequence inside a single act()
    // so React processes them in order before flushing the state batch:
    //   1. keyDown schedules cancel() → sets cancelledRef + queues state updates
    //   2. blur fires (still in same synchronous sequence, before React commits)
    //      → calls commit() with the stale draft — on the ORIGINAL code this
    //      persists 'Unwanted Name'; with the fix it sees cancelledRef and exits.
    //
    // jsdom does not fire blur automatically when a DOM node is removed, so we
    // replicate the browser's synchronous blur-during-unmount by firing both
    // events inside the same act() — matching the DraggableWindow #1965 pattern.
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      // blur fires while the input is still mounted (React defers the state
      // flush until act() exits), replicating the browser's focus-manager order.
      fireEvent.blur(input);
    });

    // The rename must NOT have been persisted.
    expect(onRenameGroup).not.toHaveBeenCalled();
  });

  it('does NOT call onRenameGroup when the value is unchanged and blur fires', () => {
    renderEditable();
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    const input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });
    // No change — blur without editing.
    fireEvent.blur(input);
    expect(onRenameGroup).not.toHaveBeenCalled();
  });

  it('does NOT call onRenameGroup when the trimmed value is empty', () => {
    renderEditable();
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    const input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onRenameGroup).not.toHaveBeenCalled();
  });

  it('allows a subsequent rename after a cancelled one', () => {
    renderEditable();

    // First rename attempt — cancel it.
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    let input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRenameGroup).not.toHaveBeenCalled();

    // Second rename attempt — commit it.
    fireEvent.click(screen.getByRole('button', { name: /Rename Team Alpha/i }));
    input = screen.getByRole('textbox', {
      name: /Rename Team Alpha/i,
    });
    fireEvent.change(input, { target: { value: 'Good Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledTimes(1);
    expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Good Name');
  });
});
