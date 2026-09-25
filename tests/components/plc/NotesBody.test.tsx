import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plc, PlcActionItem, PlcNote } from '@/types';
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

let richEditorAccess = false;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'me' },
    canAccessFeature: (id: string) =>
      id === 'plc-notes-rich-editor' && richEditorAccess,
  }),
}));

vi.mock('@/context/usePlcContext', () => ({
  useCanEditPlcContent: () => true,
}));

vi.mock('@/hooks/usePlcTrash', () => ({
  usePlcSoftDelete: () => ({ softDelete: vi.fn() }),
}));

vi.mock('@/components/plc/notes/NoteActionItems', () => ({
  NoteActionItems: ({
    items,
    onChange,
  }: {
    items: PlcActionItem[];
    onChange: (next: PlcActionItem[]) => void;
  }) => (
    <button
      type="button"
      data-testid="action-items"
      data-count={items.length}
      onClick={() =>
        onChange([
          ...items,
          {
            id: 'new',
            text: 'added',
            done: false,
            createdBy: 'me',
            createdAt: 0,
          },
        ])
      }
    />
  ),
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

// The rollout switch and the CRDT session are stubbed so this suite can drive
// both editor paths without Firestore.
let collabEnabled = false;
let crdtStatus: 'idle' | 'loading' | 'ready' | 'error' = 'ready';
let crdtContent = { title: '', body: '', actionItems: [] as PlcActionItem[] };
const setTitleMock = vi.fn();
const setBodyMock = vi.fn();
const setActionItemsMock = vi.fn();

vi.mock('@/hooks/usePlcNoteCollabSettings', () => ({
  usePlcNoteCollabSettings: () => ({ enabled: collabEnabled }),
}));

vi.mock('@/hooks/usePlcNoteCrdt', () => ({
  usePlcNoteCrdt: () => ({
    status: crdtStatus,
    doc: null,
    content: crdtContent,
    setTitle: setTitleMock,
    setBody: setBodyMock,
    setActionItems: setActionItemsMock,
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

beforeEach(() => {
  vi.useFakeTimers();
  updateNoteMock.mockClear();
  setTitleMock.mockClear();
  setBodyMock.mockClear();
  setActionItemsMock.mockClear();
  collabEnabled = false;
  richEditorAccess = false;
  crdtStatus = 'ready';
  crdtContent = { title: '', body: '', actionItems: [] };
  notes = [noteAt('Hello', 1000, 1)];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotesBody concurrent editing (legacy save path)', () => {
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

describe('NotesBody with the collaborative editor enabled', () => {
  beforeEach(() => {
    collabEnabled = true;
    crdtContent = { title: 'Shared note', body: 'Hello', actionItems: [] };
  });

  it('routes typing into the CRDT instead of a debounced save', () => {
    render(<NotesBody plc={plc} />);

    fireEvent.change(bodyBox(), { target: { value: 'Hello world' } });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(setBodyMock).toHaveBeenCalledWith('Hello world');
    // The version-preconditioned write is what produced the conflict popup.
    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it('renders the merged text coming back from the CRDT', () => {
    const { rerender } = render(<NotesBody plc={plc} />);
    expect(bodyBox().value).toBe('Hello');

    crdtContent = {
      title: 'Shared note',
      body: 'Hello from both of us',
      actionItems: [],
    };
    rerender(<NotesBody plc={plc} />);

    expect(bodyBox().value).toBe('Hello from both of us');
  });

  it('routes action-item edits into the CRDT', () => {
    render(<NotesBody plc={plc} />);

    fireEvent.click(screen.getByTestId('action-items'));

    expect(setActionItemsMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it('shows canonical text read-only until the snapshot has loaded', () => {
    crdtStatus = 'loading';
    render(<NotesBody plc={plc} />);

    // Not the empty CRDT doc — the note as Firestore already has it.
    expect(bodyBox().value).toBe('Hello');
    expect(bodyBox().readOnly).toBe(true);
  });

  it('ignores edits attempted before the snapshot has loaded', () => {
    crdtStatus = 'loading';
    render(<NotesBody plc={plc} />);

    fireEvent.change(bodyBox(), { target: { value: 'too early' } });

    expect(setBodyMock).not.toHaveBeenCalled();
    expect(updateNoteMock).not.toHaveBeenCalled();
  });
});

describe('NotesBody with the rich text editor flag', () => {
  beforeEach(() => {
    richEditorAccess = true;
    notes = [noteAt('## Agenda\n- **Tech** tips\nplain line', 1000, 1)];
  });

  const richBox = () => screen.getByRole('textbox', { name: 'Note' });

  it('opens straight into formatted, editable text with no preview toggle', () => {
    render(<NotesBody plc={plc} />);
    const box = richBox();
    expect(box.getAttribute('contenteditable')).toBe('true');
    expect(box.querySelector('h2')?.textContent).toBe('Agenda');
    expect(box.querySelector('li strong')?.textContent).toBe('Tech');
    expect(screen.queryByLabelText('Preview formatted note')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy();
  });

  it('saves edits back as Markdown', () => {
    render(<NotesBody plc={plc} />);
    const box = richBox();
    const p = box.querySelector('p');
    if (!p) throw new Error('missing paragraph');
    p.textContent = 'edited line';
    fireEvent.input(box);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(updateNoteMock).toHaveBeenCalledWith(
      'n1',
      { body: '## Agenda\n- **Tech** tips\nedited line' },
      { expectedVersion: 1 }
    );
  });

  it('does not write anything just from opening a note', () => {
    render(<NotesBody plc={plc} />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it('routes rich edits into the CRDT when collaboration is on', () => {
    collabEnabled = true;
    crdtContent = { title: 'Shared note', body: 'Hello', actionItems: [] };
    render(<NotesBody plc={plc} />);
    const box = richBox();
    const p = box.querySelector('p');
    if (!p) throw new Error('missing paragraph');
    p.textContent = 'Hello there';
    fireEvent.input(box);
    expect(setBodyMock).toHaveBeenCalledWith('Hello there');
  });
});
