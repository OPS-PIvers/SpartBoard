import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodosBody } from './TodosBody';
import type { Plc, PlcTodo } from '@/types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockUpdateText = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/usePlcTodos', () => ({
  usePlcTodos: () => ({
    todos: TODOS,
    loading: false,
    createTodo: vi.fn().mockResolvedValue(undefined),
    toggleDone: vi.fn().mockResolvedValue(undefined),
    updateText: mockUpdateText,
    deleteTodo: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(false),
    showAlert: vi.fn(),
    showPrompt: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODOS: PlcTodo[] = [
  {
    id: 'todo-1',
    text: 'Original text',
    done: false,
    createdBy: 'uid-1',
    createdAt: 0,
  },
];

const MOCK_PLC: Plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'uid-1',
  memberUids: ['uid-1'],
  memberEmails: { 'uid-1': 'teacher@test.com' },
} as Plc;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TodosBody — Escape-cancel must not persist text via stale onBlur', () => {
  beforeEach(() => {
    mockUpdateText.mockClear();
  });

  /**
   * Regression: pressing Escape to cancel an inline edit was persisting the
   * typed text to Firestore.
   *
   * Root cause: the Escape onKeyDown handler called setEditingId(null), which
   * React batched. During the commit, the browser fires blur synchronously on
   * the unmounting input with the OLD onBlur closure (still closing over the
   * typed editingText). That stale onBlur called handleSubmitEdit, which wrote
   * to Firestore — even though the user pressed Escape.
   *
   * Fix: isCancellingEditRef.current = true is set synchronously before
   * setEditingId(null). The onBlur reads the ref and short-circuits.
   *
   * jsdom does not fire blur during DOM unmount the same way real browsers do,
   * so we replicate the browser sequence by firing blur manually BEFORE React
   * commits (inside the same act() as the keyDown).
   *
   * Note: TodosBody renders a draft text input ("Add a to-do for the PLC…")
   * above the todo list. The inline edit input is identified by its initial
   * value (the todo's text), not by querySelector order.
   */
  it('does NOT call updateText when Escape cancels an in-progress edit', async () => {
    const user = userEvent.setup();
    render(<TodosBody plc={MOCK_PLC} />);

    // Click the todo text button to open the inline editor.
    const editButton = screen.getByRole('button', { name: 'Original text' });
    await user.click(editButton);

    // The inline edit input appears with the todo's current text as its value.
    // (Note: the component also renders a separate draft input at the top —
    // getByDisplayValue is the reliable way to target the edit input.)
    const input = screen.getByDisplayValue('Original text');

    // Type a different value so editingText !== todo.text.
    // handleSubmitEdit only calls updateText when the trimmed value differs,
    // so a genuinely different value makes isCancellingEditRef the sole guard
    // against the write (not just the early-return equality check).
    await user.clear(input);
    await user.type(input, 'Cancelled edit');

    // Simulate the browser's Escape-then-blur sequence.
    //   1. keyDown Escape → isCancellingEditRef.current = true → setEditingId(null) queued
    //   2. blur fires synchronously (before React commits the state update)
    //      • Bug: isCancellingEditRef not set → handleSubmitEdit called → updateText('todo-1', 'Cancelled edit')
    //      • Fix: isCancellingEditRef.current === true → onBlur bails out
    const activeInput = screen.getByDisplayValue('Cancelled edit');
    act(() => {
      fireEvent.keyDown(activeInput, { key: 'Escape', bubbles: true });
      fireEvent.blur(activeInput);
    });

    // Drain the microtask queue so any async updateText calls settle.
    await tick();

    // updateText must NOT have been called.
    expect(mockUpdateText).not.toHaveBeenCalled();
  });

  it('DOES call updateText when blur commits an edit with different text (no cancel)', async () => {
    // Sanity check: a normal blur (without Escape) should still persist the edit.
    // isCancellingEditRef starts false for every new editing session, so the
    // onBlur handler should reach handleSubmitEdit.
    const user = userEvent.setup();
    render(<TodosBody plc={MOCK_PLC} />);

    const editButton = screen.getByRole('button', { name: 'Original text' });
    await user.click(editButton);

    const input = screen.getByDisplayValue('Original text');
    await user.clear(input);
    await user.type(input, 'Updated text');

    // Blur without any Escape → isCancellingEditRef.current is false → save.
    const activeInput = screen.getByDisplayValue('Updated text');
    act(() => {
      fireEvent.blur(activeInput);
    });

    await tick();
    expect(mockUpdateText).toHaveBeenCalledWith('todo-1', 'Updated text');
  });
});
