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

const { setDocMock, docData } = vi.hoisted(() => {
  const data: { current: unknown } = { current: undefined };
  return {
    setDocMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
    docData: data,
  };
});
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

const savePermissionMock = vi.fn(() => Promise.resolve(true));

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
      : id === 'import-new-board' || id === 'import-google-forms'
        ? perm(id, { accessLevel: 'admin' })
        : id === 'universal-import'
          ? perm(id, { config: { dailyLimit: 15 } })
          : perm(id),
  isSaved: () => true,
  savePermission: savePermissionMock,
  showMessage: () => undefined,
} as unknown as Parameters<typeof ImportOffersSection>[0]['editor'];

const KINDS: Record<string, string> = {
  'Web link': 'web',
  'Google Form': 'form',
};

const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  return within(
    screen.getByTestId(`import-source-${KINDS[name] ?? 'document'}`)
  );
};

const levelOf = (
  scope: Pick<typeof screen, 'getByRole'>,
  label: string
): string | null | undefined =>
  scope
    .getByRole('radiogroup', { name: `${label} access` })
    .querySelector('[aria-checked="true"]')?.textContent;

describe('ImportOffersSection', () => {
  beforeEach(() => {
    setDocMock.mockClear();
    docData.current = { enabled: true };
  });

  it('lists every import kind with what it offers, on by default', () => {
    render(<ImportOffersSection editor={editor} />);
    expect(
      screen.getByText(
        /A link dropped on the board or sent with the Chrome extension\. Offers Embed, Link, Flashcards, Activity Wall, New board\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('switch', {
        name: /^(Web link|Picture|Dropped text)$/,
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

  it('shows who each rolling-out widget is live for on its row', () => {
    render(<ImportOffersSection editor={editor} />);
    const web = open('Web link');
    expect(levelOf(web, 'Import: Activity Wall')).toBe('Beta');
    expect(levelOf(web, 'Import: New board')).toBe('Admin');
    expect(levelOf(web, 'Import: Link')).toBe('Public');
  });

  it('puts the form access on the Google Form row, and the quiz document gate on its Quiz', () => {
    savePermissionMock.mockClear();
    render(<ImportOffersSection editor={editor} />);
    const form = open('Google Form');
    expect(levelOf(form, 'Import: Google Forms')).toBe('Admin');
    expect(
      form.getAllByRole('radiogroup', { name: 'Import: Google Forms access' })
    ).toHaveLength(1);
    expect(
      form.getByRole('radiogroup', {
        name: 'Build a quiz from a test document access',
      })
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        form.getByRole('radiogroup', { name: 'Import: Google Forms access' })
      ).getByRole('radio', { name: 'Public' })
    );
    expect(savePermissionMock).toHaveBeenCalledWith('import-google-forms', {
      accessLevel: 'public',
    });
  });

  it('lists the ways in with their own access', () => {
    render(<ImportOffersSection editor={editor} />);
    for (const label of [
      'Import: send from the Chrome extension',
      'Import: drop onto a board',
      'Import: add straight to the board',
    ])
      expect(
        screen.getByRole('radiogroup', { name: `${label} access` })
      ).toBeInTheDocument();
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
        ai: { activityWall: { enabled: true, dailyLimit: 8 } },
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
        ai: { activityWall: { enabled: false } },
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
