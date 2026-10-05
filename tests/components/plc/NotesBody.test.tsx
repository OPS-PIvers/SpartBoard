import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plc, PlcActionItem, PlcDoc, PlcNote } from '@/types';
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
let recordingAccess = false;
let unifiedAccess = false;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'me' },
    canAccessFeature: (id: string) =>
      (id === 'plc-notes-rich-editor' && richEditorAccess) ||
      (id === 'plc-meeting-recording' && recordingAccess) ||
      (id === 'plc-notes-unified' && unifiedAccess),
  }),
}));

const recorderStart = vi.fn(() => Promise.resolve());
vi.mock('@/hooks/useMeetingRecorder', () => ({
  useMeetingRecorder: () => ({
    isSupported: true,
    phase: 'idle',
    recordingId: null,
    elapsedMs: 0,
    lengthWarning: false,
    micFallback: false,
    pendingUploads: 0,
    error: null,
    mics: [],
    selectedMicId: null,
    start: recorderStart,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    retryFinalize: vi.fn(),
    selectMic: vi.fn(),
    refreshMics: vi.fn(),
    dismissMicFallback: vi.fn(),
  }),
}));

let docs: PlcDoc[] = [];
vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: () => ({
    docs,
    loading: false,
    error: null,
    createDoc: vi.fn(() => Promise.resolve('d-new')),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    restoreDoc: vi.fn(),
  }),
}));

const getOrCreateDocUrlMock = vi.fn(() =>
  Promise.resolve('https://docs.google.com/document/d/made/edit')
);
vi.mock('@/hooks/usePlcNoteGoogleDoc', () => ({
  usePlcNoteGoogleDoc: () => ({
    creatingNoteId: null,
    getOrCreateDocUrl: getOrCreateDocUrlMock,
  }),
}));

vi.mock('@/hooks/usePlcRecordings', () => ({
  usePlcRecordings: () => ({
    recordings: [],
    loading: false,
    deleteAudio: vi.fn(),
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

const BODY_PLACEHOLDER = 'Write your notes… (markdown supported)';

// Notes open rendered, so switch to the markdown box first when needed.
const bodyBox = () => {
  if (!screen.queryByPlaceholderText(BODY_PLACEHOLDER)) {
    fireEvent.click(screen.getByLabelText('Edit note'));
  }
  return screen.getByPlaceholderText<HTMLTextAreaElement>(BODY_PLACEHOLDER);
};

beforeEach(() => {
  vi.useFakeTimers();
  updateNoteMock.mockClear();
  setTitleMock.mockClear();
  setBodyMock.mockClear();
  setActionItemsMock.mockClear();
  collabEnabled = false;
  richEditorAccess = false;
  recordingAccess = false;
  unifiedAccess = false;
  docs = [];
  getOrCreateDocUrlMock.mockClear();
  recorderStart.mockClear();
  crdtStatus = 'ready';
  crdtContent = { title: '', body: '', actionItems: [] };
  notes = [noteAt('Hello', 1000, 1)];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotesBody concurrent editing (legacy save path)', () => {
  it('opens an empty note ready to type', () => {
    notes = [noteAt('', 1000, 1)];
    render(<NotesBody plc={plc} />);
    expect(screen.getByPlaceholderText(BODY_PLACEHOLDER)).toBeTruthy();
  });

  it('opens a note rendered, not as raw markdown', () => {
    render(<NotesBody plc={plc} />);
    expect(screen.queryByPlaceholderText(BODY_PLACEHOLDER)).toBeNull();
    expect(screen.getByLabelText('Edit note')).toBeTruthy();
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

describe('NotesBody saves in a row', () => {
  const titleBox = () =>
    screen.getByPlaceholderText<HTMLInputElement>('Note title');
  const flushSaves = async () => {
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    notes = [noteAt('', 1000, 0, 'n1', '')];
  });

  it('builds the next save on the version its own last save produced', async () => {
    const { rerender } = render(<NotesBody plc={plc} />);

    fireEvent.change(titleBox(), { target: { value: 'Tech Tips Planning' } });
    await flushSaves();
    // Typing resumes before the echo of the title save arrives.
    fireEvent.change(bodyBox(), { target: { value: 'Once a week' } });
    notes = [noteAt('', 2000, 1, 'n1', 'Tech Tips Planning')];
    rerender(<NotesBody plc={plc} />);
    await flushSaves();

    expect(updateNoteMock.mock.calls).toEqual([
      ['n1', { title: 'Tech Tips Planning' }, { expectedVersion: 0 }],
      ['n1', { body: 'Once a week' }, { expectedVersion: 1 }],
    ]);
  });

  it('waits for a save still in flight before sending the next one', async () => {
    let land: () => void = () => undefined;
    updateNoteMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => (land = resolve))
    );
    render(<NotesBody plc={plc} />);

    fireEvent.change(titleBox(), { target: { value: 'Tech Tips Planning' } });
    await flushSaves();
    fireEvent.change(bodyBox(), { target: { value: 'Once a week' } });
    await flushSaves();
    expect(updateNoteMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      land();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updateNoteMock).toHaveBeenLastCalledWith(
      'n1',
      { body: 'Once a week' },
      { expectedVersion: 1 }
    );
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

  it('falls back to the plain editor when collaboration is on', () => {
    collabEnabled = true;
    crdtContent = { title: 'Shared note', body: 'Hello', actionItems: [] };
    render(<NotesBody plc={plc} />);
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  });
});

describe('NotesBody meeting recording', () => {
  it('hides Record without the recording flag', () => {
    render(<NotesBody plc={plc} />);
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  });

  it('puts Record in the rich editor toolbar', () => {
    recordingAccess = true;
    richEditorAccess = true;
    render(<NotesBody plc={plc} />);
    const toolbar = screen.getByRole('toolbar');
    expect(
      toolbar.contains(screen.getByRole('button', { name: 'Record' }))
    ).toBe(true);
  });

  it('starts recording and turns a freeform note into a meeting note', async () => {
    recordingAccess = true;
    render(<NotesBody plc={plc} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(recorderStart).toHaveBeenCalledWith({
      plcId: 'plc1',
      noteId: 'n1',
      recorderUid: 'me',
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(updateNoteMock).toHaveBeenCalledWith(
      'n1',
      { kind: 'meeting' },
      { expectedVersion: 1 }
    );
  });
});

describe('NotesBody with notes and docs in one list', () => {
  const pacingDoc: PlcDoc = {
    id: 'd1',
    title: 'Pacing guide',
    url: 'https://docs.google.com/document/d/pacing/edit',
    createdBy: 'them',
    createdByName: 'Them',
    createdAt: 0,
    updatedAt: 500,
  };

  it('keeps the Meeting button and hides docs while the flag is off', () => {
    docs = [pacingDoc];
    render(<NotesBody plc={plc} />);
    expect(screen.getByText('Meeting')).toBeTruthy();
    expect(screen.queryByText('Pacing guide')).toBeNull();
    expect(screen.queryByText('Open in Docs')).toBeNull();
  });

  it('lists linked Google Docs with the notes and opens one in the pane', () => {
    unifiedAccess = true;
    docs = [pacingDoc];
    render(<NotesBody plc={plc} />);
    fireEvent.click(screen.getByText('Pacing guide'));
    expect(screen.getByTitle('Pacing guide').tagName).toBe('IFRAME');
  });

  it('offers a meeting note, a blank note and a Google Doc from New', () => {
    unifiedAccess = true;
    render(<NotesBody plc={plc} />);
    expect(screen.queryByText('Meeting')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(
      ['Meeting note', 'Blank note', 'Link a Google Doc']
    );
  });

  it('Open in Docs opens the doc made for the note', async () => {
    unifiedAccess = true;
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(tab as unknown as Window);
    render(<NotesBody plc={plc} />);
    fireEvent.click(screen.getByText('Open in Docs'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getOrCreateDocUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1' }),
      expect.objectContaining({ title: 'Shared note', body: 'Hello' })
    );
    expect(tab.location.href).toBe(
      'https://docs.google.com/document/d/made/edit'
    );
    expect(tab.opener).toBeNull();
    openSpy.mockRestore();
  });
});
