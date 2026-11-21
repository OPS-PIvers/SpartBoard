import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  WidgetData,
  WritingAssignmentDefinition,
  WritingAssignmentRecord,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useWritingAssignmentLibrary } from '@/hooks/useWritingAssignmentLibrary';
import { useFolders } from '@/hooks/useFolders';
import { useWritingAssignmentSessions } from '@/hooks/useWritingAssignmentSessions';
import { WritingManager } from './WritingManager';

vi.mock('@/context/useAuth');
vi.mock('@/context/useDashboard');
vi.mock('@/hooks/useWritingAssignmentLibrary');
vi.mock('@/hooks/useFolders');
vi.mock('@/hooks/useWritingAssignmentSessions');
vi.mock('./WritingAssignStepper', () => ({
  WritingAssignStepper: ({ item }: { item: WritingAssignmentDefinition }) => (
    <div role="dialog">{`Assigning ${item.id}`}</div>
  ),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('./WritingEditorModal', () => ({
  WritingEditorModal: ({
    assignment,
  }: {
    assignment: WritingAssignmentDefinition;
  }) => <div role="dialog">{`Editing ${assignment.id}`}</div>,
}));

const saveAssignment = vi.fn().mockResolvedValue(undefined);
const endSession = vi.fn().mockResolvedValue(undefined);
const updateWidget = vi.fn();

const item = (
  overrides: Partial<WritingAssignmentDefinition> = {}
): WritingAssignmentDefinition => ({
  id: 'wa-1',
  title: 'Argument essay',
  prompt: 'Is homework worth it?',
  grading: { mode: 'points', points: 20 },
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const widget = (config = {}): WidgetData =>
  ({
    id: 'writing-1',
    type: 'writing',
    x: 0,
    y: 0,
    w: 620,
    h: 560,
    z: 1,
    config: { view: 'manager', managerTab: 'library', ...config },
  }) as unknown as WidgetData;

const mockLibrary = (assignments: WritingAssignmentDefinition[]) =>
  (
    useWritingAssignmentLibrary as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    assignments,
    loading: false,
    error: null,
    saveAssignment,
    deleteAssignment: vi.fn(),
    duplicateAssignment: vi.fn(),
    reorderAssignments: vi.fn(),
  });

const record = (
  overrides: Partial<WritingAssignmentRecord> = {}
): WritingAssignmentRecord => ({
  id: 's-1',
  sessionId: 's-1',
  itemId: 'wa-1',
  title: 'Argument essay',
  teacherUid: 'teacher-1',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  periodNames: ['Period 1'],
  ...overrides,
});

const mockSessions = (records: WritingAssignmentRecord[]) =>
  (
    useWritingAssignmentSessions as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    records,
    loading: false,
    assign: vi.fn(),
    end: endSession,
    remove: vi.fn(),
  });

describe('WritingManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      canAccessFeature: () => false,
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [],
    });
    mockSessions([]);
    (useFolders as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      folders: [],
      loading: false,
      error: null,
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      deleteFolder: vi.fn(),
      reorderSiblings: vi.fn(),
      moveItem: vi.fn(),
      setFolderColor: vi.fn(),
    });
  });

  it('shows the empty library', () => {
    mockLibrary([]);
    render(<WritingManager widget={widget()} />);
    expect(screen.getByText('No writing assignments yet')).toBeInTheDocument();
  });

  it('lists library items with their grading and keeps archived ones out', () => {
    mockLibrary([
      item(),
      item({ id: 'wa-2', title: 'Old essay', archivedAt: 5 }),
    ]);
    render(<WritingManager widget={widget()} />);
    expect(screen.getByText('Argument essay')).toBeInTheDocument();
    expect(screen.getByText(/20 points/)).toBeInTheDocument();
    expect(screen.queryByText('Old essay')).not.toBeInTheDocument();
  });

  it('creates an ungraded assignment and opens it in the editor', async () => {
    mockLibrary([]);
    render(<WritingManager widget={widget()} />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'New writing assignment' })[0]
    );
    await waitFor(() => expect(saveAssignment).toHaveBeenCalledOnce());
    const created = saveAssignment.mock
      .calls[0][0] as WritingAssignmentDefinition;
    expect(created.grading).toEqual({ mode: 'ungraded' });
    expect(created.folderId).toBeNull();
  });

  it('makes Assign the row button and keeps Edit in the menu', () => {
    mockLibrary([item()]);
    render(<WritingManager widget={widget()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Assigning wa-1');
    expect(
      screen.queryByRole('button', { name: 'Back to library' })
    ).not.toBeInTheDocument();
  });

  it('shows the three tabs with In Progress and Completed counts', () => {
    mockLibrary([item()]);
    mockSessions([
      record(),
      record({ id: 's-2', title: 'Book review', status: 'ended' }),
    ]);
    render(<WritingManager widget={widget()} />);
    expect(screen.getAllByText('Library').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });

  it('lists active sessions on In Progress and ended ones on Completed', () => {
    mockLibrary([]);
    mockSessions([
      record(),
      record({ id: 's-2', title: 'Book review', status: 'ended' }),
    ]);
    const { rerender } = render(
      <WritingManager widget={widget({ managerTab: 'active' })} />
    );
    expect(screen.getByText('Argument essay')).toBeInTheDocument();
    expect(screen.queryByText('Book review')).not.toBeInTheDocument();
    rerender(<WritingManager widget={widget({ managerTab: 'archive' })} />);
    expect(screen.getByText('Book review')).toBeInTheDocument();
    expect(screen.queryByText('Argument essay')).not.toBeInTheDocument();
  });

  it('shows the In Progress empty state', () => {
    mockLibrary([]);
    render(<WritingManager widget={widget({ managerTab: 'active' })} />);
    expect(
      screen.getByText('No writing assignments in progress')
    ).toBeInTheDocument();
  });
});
