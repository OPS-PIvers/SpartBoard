/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import type {
  Collection,
  Dashboard,
  AnyTemplate,
  DashboardTemplate,
} from '@/types';

const addDocMock = vi.fn().mockResolvedValue({ id: 'new-template-id' });
const setDocMock = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'COLL_REF'),
  doc: vi.fn(() => 'DOC_REF'),
  onSnapshot: vi.fn((_q: unknown, _onNext: unknown) => () => undefined),
  query: vi.fn((c: unknown) => c),
  orderBy: vi.fn(),
  addDoc: (...args: unknown[]): unknown => addDocMock(...args),
  setDoc: (...args: unknown[]): unknown => setDocMock(...args),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: true, // routes writes to mock store, not Firestore
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

// Capture what the mock store receives so tests can assert on it.
const savedTemplates: AnyTemplate[] = [];
vi.mock('@/hooks/useTemplateStore', () => ({
  mockTemplateStore: {
    save: (t: AnyTemplate) => {
      savedTemplates.push(t);
    },
    getAll: () => savedTemplates,
  },
}));

const collection: Collection = {
  id: 'coll1',
  name: 'Morning Routine',
  parentCollectionId: null,
  order: 0,
  color: '#abc',
  icon: 'star',
  createdAt: 1000,
};

const board = (id: string, name: string): Dashboard => ({
  id,
  name,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
  collectionId: 'coll1',
});

beforeEach(() => {
  addDocMock.mockClear();
  setDocMock.mockClear();
  savedTemplates.length = 0;
});

describe('SaveAsTemplateModal — Collection target', () => {
  it('captures Collection metadata + child Board snapshots when saving a Collection', async () => {
    render(
      <SaveAsTemplateModal
        isOpen
        onClose={() => undefined}
        target={{
          kind: 'collection',
          collection,
          boards: [board('b1', 'Welcome'), board('b2', 'Math')],
        }}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Morning Routine/i), {
      target: { value: 'My Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save New Template/i }));

    // In auth-bypass mode, writes go to the mock store — NOT addDoc.
    await waitFor(() => expect(savedTemplates).toHaveLength(1));
    expect(addDocMock).not.toHaveBeenCalled();
    const written = savedTemplates[0] as unknown as Record<string, unknown>;
    expect(written.type).toBe('collection');
    expect(written.collectionSnapshot).toMatchObject({
      name: 'Morning Routine',
      color: '#abc',
      icon: 'star',
    });
    expect(written.boardSnapshots).toHaveLength(2);
    const snapshots = written.boardSnapshots as Array<Record<string, unknown>>;
    expect(snapshots[0]).toMatchObject({ id: 'b1', name: 'Welcome' });
    expect(snapshots[1]).toMatchObject({ id: 'b2', name: 'Math' });
    // Sanitization removes collectionId from each snapshot.
    expect(snapshots[0]).not.toHaveProperty('collectionId');
    expect(snapshots[1]).not.toHaveProperty('collectionId');
    expect(written.name).toBe('My Template');
    expect(written.createdBy).toBe('admin@example.com');
  });

  it('renders the Collection title in the modal heading', () => {
    render(
      <SaveAsTemplateModal
        isOpen
        onClose={() => undefined}
        target={{
          kind: 'collection',
          collection,
          boards: [board('b1', 'Welcome')],
        }}
      />
    );
    expect(
      screen.getByText(/Save Collection as Template/i)
    ).toBeInTheDocument();
  });
});

describe('SaveAsTemplateModal — Board target', () => {
  const someBoard: Dashboard = {
    id: 'b1',
    name: 'My Board',
    background: 'bg-slate-900',
    widgets: [{ id: 'w1', type: 'clock' } as Dashboard['widgets'][number]],
    createdAt: 1000,
  };

  it('writes a Board-target template with type: "board" and widgets', async () => {
    render(
      <SaveAsTemplateModal
        isOpen
        onClose={() => undefined}
        target={{ kind: 'board', dashboard: someBoard }}
      />
    );

    expect(screen.getByText(/Save Board as Template/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Morning Routine/i), {
      target: { value: 'My Board Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save New Template/i }));

    await waitFor(() => expect(savedTemplates).toHaveLength(1));
    const written = savedTemplates[0] as unknown as DashboardTemplate;
    expect(written.type).toBe('board');
    expect(written.name).toBe('My Board Template');
    expect(written.widgets).toHaveLength(1);
    expect(written.createdBy).toBe('admin@example.com');
    // addDoc should NOT be called in auth-bypass mode
    expect(addDocMock).not.toHaveBeenCalled();
  });
});
