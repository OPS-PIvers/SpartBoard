/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import type { Collection, Dashboard } from '@/types';

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
  isAuthBypass: true, // skip the snapshot subscription
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
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

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    const written = addDocMock.mock.calls[0][1] as Record<string, unknown>;
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
