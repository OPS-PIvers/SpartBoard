import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';

const { setDocMock, docData } = vi.hoisted(() => ({
  setDocMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
  docData: { current: undefined },
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
  }),
  onSnapshot: (
    _ref: unknown,
    next: (snap: { exists: () => boolean; data: () => unknown }) => void
  ) => {
    next({ exists: () => !!docData.current, data: () => docData.current });
    return () => undefined;
  },
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

import { ImportOffersSection } from './ImportOffersSection';

const perm = (
  featureId: GlobalFeature,
  over: Partial<GlobalFeaturePermission> = {}
): GlobalFeaturePermission => ({
  featureId,
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  ...over,
});

const editor = {
  getPermission: (id: GlobalFeature) =>
    id === 'import-activity-wall'
      ? perm(id, { accessLevel: 'beta', betaUsers: ['a@x', 'b@x'] })
      : id === 'import-new-board'
        ? perm(id, { accessLevel: 'admin' })
        : id === 'universal-import'
          ? perm(id, { config: { dailyLimit: 15 } })
          : perm(id),
} as unknown as Parameters<typeof ImportOffersSection>[0]['editor'];

const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  return within(
    screen.getByTestId(
      `import-source-${name === 'Web link' ? 'web' : 'document'}`
    )
  );
};

describe('ImportOffersSection', () => {
  beforeEach(() => {
    setDocMock.mockClear();
    docData.current = { enabled: true };
  });

  it('lists every import kind with what it offers, on by default', () => {
    render(<ImportOffersSection editor={editor} />);
    expect(
      screen.getByText(
        /A page address pasted or dropped on the board\. Offers Embed, Link, Flashcards, Activity Wall, New board\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('switch', {
        name: /^(Web link|Picture|Pasted text)$/,
      })
    ).toHaveLength(3);
    expect(screen.getByRole('switch', { name: 'Picture' })).toBeChecked();
  });

  it('saves a kind switched off and a widget unchecked', () => {
    render(<ImportOffersSection editor={editor} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Picture' }));
    expect(setDocMock).toHaveBeenLastCalledWith(
      { path: 'admin_settings/import_conversion' },
      { sources: { picture: { enabled: false } } },
      { merge: true }
    );
    const web = open('Web link');
    fireEvent.click(web.getByRole('checkbox', { name: 'Embed' }));
    expect(setDocMock).toHaveBeenLastCalledWith(
      { path: 'admin_settings/import_conversion' },
      { sources: { web: { off: ['embed'] } } },
      { merge: true }
    );
  });

  it('shows who a rolling-out widget is live for', () => {
    render(<ImportOffersSection editor={editor} />);
    const web = open('Web link');
    expect(web.getByText('Preview: admins and 2 testers')).toBeInTheDocument();
    expect(web.getByText('Preview: admins')).toBeInTheDocument();
  });

  it('gives each AI widget its own switch and limit, keeping the old switch in step', async () => {
    docData.current = {
      enabled: true,
      ai: { flashcards: { enabled: false }, board: { enabled: false } },
    };
    render(<ImportOffersSection editor={editor} />);
    const docs = open('Document or PDF');
    const wall = docs.getByRole('spinbutton', {
      name: 'Activity Wall with AI daily limit',
    });
    expect(wall).toHaveValue(15);
    fireEvent.change(wall, { target: { value: '8' } });
    fireEvent.blur(wall);
    expect(setDocMock).toHaveBeenLastCalledWith(
      { path: 'admin_settings/import_conversion' },
      {
        ai: {
          flashcards: {},
          activityWall: { enabled: true, dailyLimit: 8 },
          board: {},
        },
        enabled: true,
      },
      { merge: true }
    );
    const toggle = docs.getByRole('switch', { name: 'Activity Wall with AI' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    expect(setDocMock).toHaveBeenLastCalledWith(
      { path: 'admin_settings/import_conversion' },
      {
        ai: { flashcards: {}, activityWall: { enabled: false }, board: {} },
        enabled: false,
      },
      { merge: true }
    );
    expect(
      docs.queryByRole('spinbutton', { name: 'Flashcards with AI daily limit' })
    ).toBeNull();
  });

  it('pins the other widgets to their current value when one AI switch is turned on', () => {
    docData.current = { enabled: false };
    render(<ImportOffersSection editor={editor} />);
    const docs = open('Document or PDF');
    fireEvent.click(docs.getByRole('switch', { name: 'Flashcards with AI' }));
    expect(setDocMock).toHaveBeenLastCalledWith(
      { path: 'admin_settings/import_conversion' },
      {
        ai: {
          flashcards: { enabled: true },
          activityWall: { enabled: false },
          board: { enabled: false },
        },
        enabled: true,
      },
      { merge: true }
    );
  });

  it('ignores a limit outside 1 to 1000', () => {
    render(<ImportOffersSection editor={editor} />);
    const docs = open('Document or PDF');
    const field = docs.getByRole('spinbutton', {
      name: 'Flashcards with AI daily limit',
    });
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.blur(field);
    expect(setDocMock).not.toHaveBeenCalled();
    expect(field).toHaveValue(15);
  });
});
