import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import type { HelpResourceItem } from '@/types/helpCenter';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-id' })),
  updateDoc: vi.fn(() => Promise.resolve(undefined)),
  deleteDoc: vi.fn(() => Promise.resolve(undefined)),
  setDoc: vi.fn(() => Promise.resolve(undefined)),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(() => Promise.resolve(undefined)),
}));

const authState = vi.hoisted(() => ({
  value: {
    user: { uid: 'u1', email: 'super@school.org' },
    userRoles: { superAdmins: ['super@school.org'] },
    orgId: null as string | null,
  },
}));

const helpState = vi.hoisted(() => ({
  items: [] as HelpResourceItem[],
}));

vi.mock('firebase/firestore', () => ({
  addDoc: firestoreMocks.addDoc,
  updateDoc: firestoreMocks.updateDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  setDoc: firestoreMocks.setDoc,
  getDoc: firestoreMocks.getDoc,
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collection: (_db: unknown, name: string) => ({ name }),
  writeBatch: () => ({
    update: firestoreMocks.batchUpdate,
    commit: firestoreMocks.batchCommit,
  }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => authState.value,
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(() => Promise.resolve(true)) }),
}));

vi.mock('@/hooks/useHelpResources', () => ({
  useHelpResources: () => ({
    items: helpState.items,
    categories: [{ id: 'getting-started', name: 'Getting started', order: 0 }],
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ organizations: [] }),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: null }),
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({
    sets: [],
    buildingSets: [],
    loadSetData: vi.fn(),
    saveBuildingSet: vi.fn(),
  }),
}));

vi.mock('@/components/common/SortableList', () => ({
  SortableList: <T,>({
    items,
    onReorder,
    getId,
    renderItem,
  }: {
    items: T[];
    onReorder: (next: T[], movedId: string) => void;
    getId: (item: T) => string;
    renderItem: (
      item: T,
      handle: {
        attributes: Record<string, unknown>;
        listeners: Record<string, unknown>;
        isDragging: boolean;
      },
      index: number
    ) => React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onReorder([...items].reverse(), getId(items[items.length - 1]))
        }
      >
        reverse
      </button>
      {items.map((item, index) => (
        <div key={getId(item)}>
          {renderItem(
            item,
            { attributes: {}, listeners: {}, isDragging: false },
            index
          )}
        </div>
      ))}
    </div>
  ),
}));

import { HelpCenterManager } from './HelpCenterManager';

const makeItem = (over: Partial<HelpResourceItem>): HelpResourceItem => ({
  id: 'i1',
  kind: 'embed',
  title: 'Item',
  description: '',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: [],
  url: 'https://docs.google.com/document/d/abc/edit',
  embedType: 'doc',
  setId: null,
  openCount: 0,
  createdBy: 'u1',
  createdByEmail: 'super@school.org',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const asSuperAdmin = () => {
  authState.value = {
    user: { uid: 'u1', email: 'super@school.org' },
    userRoles: { superAdmins: ['super@school.org'] },
    orgId: null,
  };
};

const asOrgAdmin = () => {
  authState.value = {
    user: { uid: 'u2', email: 'admin@school.org' },
    userRoles: { superAdmins: ['super@school.org'] },
    orgId: 'orono',
  };
};

const fillAndSave = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
  fireEvent.change(screen.getByLabelText('Link'), {
    target: { value: 'https://docs.google.com/document/d/abc/edit' },
  });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Getting started guide' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
};

describe('HelpCenterManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.getDoc.mockResolvedValue({ exists: () => false });
    helpState.items = [];
    asSuperAdmin();
  });

  afterEach(() => cleanup());

  it('seeds the category config once for a super admin', async () => {
    render(<HelpCenterManager />);
    await waitFor(() => expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1));
    const [, payload] = firestoreMocks.setDoc.mock.calls[0];
    expect((payload as { categories: { id: string }[] }).categories[0].id).toBe(
      'getting-started'
    );
  });

  it('does not seed the category config for an org admin', async () => {
    asOrgAdmin();
    render(<HelpCenterManager />);
    await waitFor(() => expect(firestoreMocks.getDoc).not.toHaveBeenCalled());
    expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
  });

  it('stamps orgId null when a super admin creates an item', async () => {
    render(<HelpCenterManager />);
    fillAndSave();
    await waitFor(() => expect(firestoreMocks.addDoc).toHaveBeenCalled());
    const [, payload] = firestoreMocks.addDoc.mock.calls[0];
    expect(payload).toMatchObject({
      orgId: null,
      embedType: 'doc',
      openCount: 0,
    });
  });

  it("stamps the admin's orgId when an org admin creates an item", async () => {
    asOrgAdmin();
    render(<HelpCenterManager />);
    fillAndSave();
    await waitFor(() => expect(firestoreMocks.addDoc).toHaveBeenCalled());
    const [, payload] = firestoreMocks.addDoc.mock.calls[0];
    expect(payload).toMatchObject({ orgId: 'orono' });
  });

  it('shows the inferred embed type for a pasted URL', async () => {
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'https://www.youtube.com/watch?v=abc' },
    });
    expect(await screen.findByText('youtube')).toBeInTheDocument();
  });

  it('blocks saving an http URL', () => {
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'http://example.com/guide' },
    });
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Insecure' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
  });

  it('writes new order values on reorder', async () => {
    helpState.items = [
      makeItem({ id: 'a', title: 'A', order: 0 }),
      makeItem({ id: 'b', title: 'B', order: 1 }),
    ];
    render(<HelpCenterManager />);
    const reverseButtons = screen.getAllByRole('button', { name: 'reverse' });
    fireEvent.click(reverseButtons[reverseButtons.length - 1]);
    await waitFor(() => expect(firestoreMocks.batchCommit).toHaveBeenCalled());
    expect(firestoreMocks.batchUpdate).toHaveBeenCalledTimes(2);
    expect(firestoreMocks.batchUpdate.mock.calls[0][1]).toMatchObject({
      order: 0,
    });
    expect(firestoreMocks.batchUpdate.mock.calls[1][1]).toMatchObject({
      order: 1,
    });
  });
});
