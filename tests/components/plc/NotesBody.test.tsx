import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plc, PlcNote } from '@/types';
import { NotesBody } from '@/components/plc/bodies/NotesBody';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(() => Promise.resolve(true)) }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

vi.mock('@/context/usePlcContext', () => ({
  useCanEditPlcContent: () => true,
}));

vi.mock('@/hooks/usePlcTrash', () => ({
  usePlcSoftDelete: () => ({ softDelete: vi.fn() }),
}));

vi.mock('@/components/plc/notes/NoteActionItems', () => ({
  NoteActionItems: () => <div data-testid="action-items" />,
}));

let notes: PlcNote[] = [];
const updateNoteMock = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/usePlcNotes', () => ({
  PlcNoteVersionConflictError: class extends Error {},
  usePlcNotes: () => ({
    notes,
    loading: false,
    error: null,
    createNote: vi.fn(() => Promise.resolve('new')),
    updateNote: updateNoteMock,
    deleteNote: vi.fn(),
    restoreNote: vi.fn(),
  }),
}));

const plc = { id: 'plc1', name: 'Test PLC', members: {} } as Plc;

function noteAt(
  body: string,
  lastEditedAt: number,
  version: number,
  id = 'n1',
  title = 'Shared note'
): PlcNote {
  return {
    id,
    title,
    body,
    createdBy: 'them',
    createdAt: 0,
    lastEditedBy: 'them',
    lastEditedAt,
    version,
    actionItems: [],
  };
}

const bodyBox = () =>
  screen.getByPlaceholderText<HTMLTextAreaElement>(
    'Write your notes… (markdown supported)'
  );

describe('NotesBody concurrent editing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateNoteMock.mockClear();
    notes = [noteAt('Hello', 1000, 1)];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps text typed while a save is in flight when a teammate edit lands', () => {
    const { rerender } = render(<NotesBody plc={plc} />);
    expect(bodyBox().value).toBe('Hello');

    // Local edit, then let the debounce dispatch the write.
    fireEvent.change(bodyBox(), { target: { value: 'Hello world' } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(updateNoteMock).toHaveBeenCalledTimes(1);

    // The teammate's edit arrives before our write resolves. This is the exact
    // window in which the old `pendingNoteId` guard was already open.
    notes = [noteAt('Hello there', 2000, 2)];
    rerender(<NotesBody plc={plc} />);

    expect(bodyBox().value).toBe('Hello world');
  });

  it('keeps unsaved text when a teammate edit lands mid-typing', () => {
    const { rerender } = render(<NotesBody plc={plc} />);

    fireEvent.change(bodyBox(), { target: { value: 'Hello draft' } });
    notes = [noteAt('Hello there', 2000, 2)];
    rerender(<NotesBody plc={plc} />);

    expect(bodyBox().value).toBe('Hello draft');
  });

  it('still pulls in a teammate edit when the draft has no unsaved work', () => {
    const { rerender } = render(<NotesBody plc={plc} />);
    expect(bodyBox().value).toBe('Hello');

    notes = [noteAt('Hello there', 2000, 2)];
    rerender(<NotesBody plc={plc} />);

    expect(bodyBox().value).toBe('Hello there');
  });

  it('keeps auto-pull alive on a note selected while a save was in flight', async () => {
    // handleSelect flushes the outgoing note's save and then re-baselines for
    // the incoming one. If that in-flight write marks its own captured draft
    // clean when it lands, the baseline describes the wrong note and the
    // visible draft reads dirty forever — auto-pull dies silently.
    notes = [
      noteAt('Hello', 1000, 1),
      noteAt('Second', 1000, 1, 'n2', 'Other'),
    ];
    const { rerender } = render(<NotesBody plc={plc} />);

    fireEvent.change(bodyBox(), { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByText('Other'));
    expect(bodyBox().value).toBe('Second');

    // The first note's write now lands, after the selection already moved.
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    notes = [
      noteAt('Hello world', 2000, 2),
      noteAt('Second, edited by a teammate', 2000, 2, 'n2', 'Other'),
    ];
    rerender(<NotesBody plc={plc} />);

    expect(bodyBox().value).toBe('Second, edited by a teammate');
  });

  it('resumes auto-pull once the local edit has been saved', async () => {
    const { rerender } = render(<NotesBody plc={plc} />);

    fireEvent.change(bodyBox(), { target: { value: 'Hello world' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    // Our own write echoes back as canonical — draft is clean again.
    notes = [noteAt('Hello world', 2000, 2)];
    rerender(<NotesBody plc={plc} />);
    expect(bodyBox().value).toBe('Hello world');

    // A later teammate edit is now safe to absorb.
    notes = [noteAt('Hello world and more', 3000, 3)];
    rerender(<NotesBody plc={plc} />);
    expect(bodyBox().value).toBe('Hello world and more');
  });
});
