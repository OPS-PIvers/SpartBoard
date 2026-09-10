import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plc, PlcNote, PlcTodo } from '@/types';
import { NotesDocsBody } from '@/components/plc/bodies/NotesDocsBody';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string; count?: number }) => {
      const base = o?.defaultValue ?? _k;
      return o?.count !== undefined
        ? base.replace('{{count}}', String(o.count))
        : base;
    },
  }),
}));

vi.mock('@/components/plc/docs/PlcDocsBody', () => ({
  PlcDocsBody: () => <div data-testid="docs-body" />,
}));

vi.mock('@/components/plc/bodies/NotesBody', () => ({
  NotesBody: ({ selectNoteId }: { selectNoteId?: string | null }) => (
    <div data-testid="notes-body">{selectNoteId ?? 'none'}</div>
  ),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

const addToastMock = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: addToastMock }),
}));

vi.mock('@/context/usePlcContext', () => ({
  useCanEditPlcContent: () => true,
}));

const noteWithOpenItems: PlcNote = {
  id: 'n1',
  title: 'Meeting notes',
  body: '',
  createdBy: 'me',
  createdAt: 0,
  lastEditedBy: 'me',
  lastEditedAt: 0,
  actionItems: [
    {
      id: 'a1',
      text: 'Open item',
      done: false,
      createdBy: 'me',
      createdAt: 0,
    },
  ],
};

let mockTodos: PlcTodo[] = [];
const createNoteMock = vi.fn(() => Promise.resolve('new-note-id'));
const updateNoteMock = vi.fn(() => Promise.resolve());
const archiveTodosMock = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/usePlcNotes', () => ({
  usePlcNotes: () => ({
    notes: [noteWithOpenItems],
    loading: false,
    error: null,
    createNote: createNoteMock,
    updateNote: updateNoteMock,
    deleteNote: vi.fn(),
    restoreNote: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlcTodos', () => ({
  usePlcTodos: () => ({
    todos: mockTodos,
    loading: false,
    error: null,
    archiveTodos: archiveTodosMock,
  }),
}));

const fakePlc: Plc = {
  id: 'plc1',
  name: 'Test PLC',
  members: {},
} as Plc;

describe('NotesDocsBody', () => {
  beforeEach(() => {
    mockTodos = [];
    createNoteMock.mockClear();
    updateNoteMock.mockClear();
    archiveTodosMock.mockClear();
    addToastMock.mockClear();
  });

  it('renders the open action items rollup count', () => {
    render(<NotesDocsBody plc={fakePlc} />);
    expect(
      screen.getByRole('button', { name: /Open action items \(1\)/ })
    ).toBeInTheDocument();
  });

  it('does not show the import banner when there are no legacy todos', () => {
    render(<NotesDocsBody plc={fakePlc} />);
    expect(screen.queryByText(/Import \d+ to-dos/)).not.toBeInTheDocument();
  });

  it('import banner creates a note then archives the todos', async () => {
    mockTodos = [
      {
        id: 't1',
        text: 'Legacy todo',
        done: false,
        createdBy: 'me',
        createdAt: 0,
      },
    ];
    render(<NotesDocsBody plc={fakePlc} />);
    const importBtn = screen.getByRole('button', { name: 'Import' });
    fireEvent.click(importBtn);

    await waitFor(() => expect(createNoteMock).toHaveBeenCalledTimes(1));
    expect(archiveTodosMock).toHaveBeenCalledWith(['t1']);
    expect(addToastMock).toHaveBeenCalledWith(
      expect.stringContaining('Imported'),
      'success'
    );
  });

  it('does not archive the todos when creating the note fails', async () => {
    mockTodos = [
      {
        id: 't1',
        text: 'Legacy todo',
        done: false,
        createdBy: 'me',
        createdAt: 0,
      },
    ];
    createNoteMock.mockRejectedValueOnce(new Error('boom'));
    render(<NotesDocsBody plc={fakePlc} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(createNoteMock).toHaveBeenCalledTimes(1));
    expect(archiveTodosMock).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.stringContaining('Could not import'),
      'error'
    );
  });
});
