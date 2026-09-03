import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallShareModal } from './ShareModal';
import type { ActivityWallLibraryEntry } from '@/types';

// The share modal's form state is reset by remounting (a `key` on the call
// site), NOT by a props->state useEffect. These tests pin that behavior:
// every fresh open / activity switch must restore the default form values.

const { mockAddToast, mockSetDoc, mockUpdateDoc, mockCreateShortLink } =
  vi.hoisted(() => ({
    mockAddToast: vi.fn(),
    mockSetDoc: vi.fn(),
    mockUpdateDoc: vi.fn(),
    mockCreateShortLink: vi.fn(),
  }));

// ShareModal is on the canvas hot path, so it takes addToast from the canvas store.
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({
    addToast: mockAddToast,
  }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
}));

vi.mock('@/hooks/useShortLinks', () => ({
  createShortLinkAtomic: mockCreateShortLink,
}));

// Render a lightweight stand-in for the shared Modal so the test exercises the
// modal's own form state in isolation, without the portal / scroll-lock /
// Escape machinery. Mirrors `isOpen` gating + customHeader passthrough.
vi.mock('@/components/common/Modal', () => ({
  Modal: ({
    isOpen,
    customHeader,
    children,
  }: {
    isOpen: boolean;
    customHeader?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div>
        {customHeader}
        {children}
      </div>
    ) : null,
}));

const makeActivity = (
  overrides: Partial<ActivityWallLibraryEntry> = {}
): ActivityWallLibraryEntry => ({
  id: 'activity-1',
  title: 'Test Activity',
  prompt: 'Share your work',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  createdAt: 1,
  updatedAt: 1,
  layout: 'wall',
  allowedTypes: { photo: false, link: false, file: false, video: false },
  appearance: { kind: 'gradient', value: 'bg-slate-900' },
  allowGuests: false,
  showNames: false,
  maxPostsPerStudent: 0,
  allowStudentEdit: false,
  allowStudentDelete: false,
  acceptingResponses: true,
  ...overrides,
});

/**
 * Harness that reproduces the production call site (Widget.tsx): the modal is
 * always mounted, shown/hidden via `isOpen`, and force-remounted by a `key`
 * that changes on the open-edge / activity change.
 */
const Harness: React.FC<{ activity: ActivityWallLibraryEntry }> = ({
  activity,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        open
      </button>
      <button type="button" onClick={() => setIsOpen(false)}>
        close
      </button>
      <ActivityWallShareModal
        key={isOpen ? (activity.id ?? 'closed') : 'closed'}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        entry={activity}
        sessionId="session-1"
        teacherUid="teacher-1"
        studentUrl="https://example.test/activity-wall/session-1"
      />
    </>
  );
};

// The expiration checkbox is wrapped in a <label> that also contains the
// heading/body text, so multiple controls share that accessible region.
// Target it directly by its stable id to get an unambiguous, single node.
const openGalleryTab = () =>
  fireEvent.click(screen.getByRole('tab', { name: 'Public gallery' }));

const expirationCheckbox = (): HTMLInputElement => {
  const el = document.getElementById('aw-share-enable-expiration');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error('expiration checkbox not found');
  }
  return el;
};

describe('ActivityWallShareModal remount-reset', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
  });

  it('defaults the expiration toggle to off', () => {
    render(<Harness activity={makeActivity()} />);
    openGalleryTab();
    expect(expirationCheckbox()).not.toBeChecked();
  });

  it('resets a mutated field after close + reopen (key flips)', () => {
    render(<Harness activity={makeActivity()} />);
    openGalleryTab();

    // Mutate: turn the expiration toggle on (default is off). Use fireEvent for
    // a single, deterministic click — the checkbox is nested inside its own
    // <label htmlFor=...>, so userEvent.click double-toggles it.
    fireEvent.click(expirationCheckbox());
    expect(expirationCheckbox()).toBeChecked();
    // The datetime-local input only renders once expiration is enabled,
    // confirming the form actually reflected the mutation.
    expect(screen.getByDisplayValue('')).toHaveAttribute(
      'type',
      'datetime-local'
    );

    // Close then reopen. The key goes 'activity-1' -> 'closed' -> 'activity-1',
    // forcing a fresh mount with default state.
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    // Field is back to its default (off) — proves remount-driven reset.
    openGalleryTab();
    expect(expirationCheckbox()).not.toBeChecked();
  });

  it('resets a mutated field when the activity id changes (key flips)', () => {
    const { rerender } = render(
      <Harness activity={makeActivity({ id: 'activity-1' })} />
    );
    openGalleryTab();

    fireEvent.click(expirationCheckbox());
    expect(expirationCheckbox()).toBeChecked();

    // Switching to a different activity id changes the modal's key and remounts
    // it (same edge the production call site keys on).
    rerender(<Harness activity={makeActivity({ id: 'activity-2' })} />);

    openGalleryTab();
    expect(expirationCheckbox()).not.toBeChecked();
  });
});

describe('ActivityWallShareModal gallery link creation', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
    mockSetDoc.mockReset().mockResolvedValue(undefined);
    mockUpdateDoc.mockReset().mockResolvedValue(undefined);
    mockCreateShortLink.mockReset().mockResolvedValue({ ok: true });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  const renderModal = (
    overrides: Partial<ActivityWallLibraryEntry> = {},
    existingGalleryUrl?: string
  ) =>
    render(
      <ActivityWallShareModal
        isOpen
        onClose={vi.fn()}
        entry={makeActivity(overrides)}
        sessionId="teacher-1_activity-1"
        teacherUid="teacher-1"
        teacherEmail="teacher@example.com"
        studentUrl="https://example.test/activity-wall/teacher-1_activity-1"
        existingGalleryUrl={existingGalleryUrl}
      />
    );

  const clickCreate = async () => {
    openGalleryTab();
    fireEvent.click(
      screen.getByRole('button', { name: /create (public|new) gallery link/i })
    );
    await screen.findByLabelText('Share link URL');
  };

  const sessionRef = { path: 'activity_wall_sessions/teacher-1_activity-1' };

  const setDocCalls = (): [{ path: string }, Record<string, unknown>][] =>
    mockSetDoc.mock.calls as unknown as [
      { path: string },
      Record<string, unknown>,
    ][];

  it('mints a short link pointing at the gallery route and stamps the session doc', async () => {
    renderModal();
    await clickCreate();

    const shareDocCall = setDocCalls().find((call) =>
      call[0].path.startsWith('shared_activity_walls/')
    );
    expect(shareDocCall).toBeTruthy();
    const shareId = (shareDocCall?.[0].path ?? '').split('/')[1];

    expect(mockCreateShortLink).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        destination: `${window.location.origin}/activity-wall/gallery/${shareId}`,
        createdBy: 'teacher-1',
        createdByEmail: 'teacher@example.com',
      })
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith(sessionRef, {
      publiclyShared: true,
      latestShareId: shareId,
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      sessionRef,
      { latestShareCode: expect.any(String) as unknown as string },
      { merge: true }
    );
  });

  it('copies the wall-level engagement flags onto the share doc', async () => {
    renderModal({
      allowLikes: true,
      allowComments: false,
      allowCommentResponses: true,
    });
    await clickCreate();

    const shareDocCall = setDocCalls().find((call) =>
      call[0].path.startsWith('shared_activity_walls/')
    );
    expect(shareDocCall?.[1]).toMatchObject({
      allowLikes: true,
      allowComments: false,
      allowCommentResponses: false,
    });
    expect(screen.queryByRole('checkbox', { name: /allow likes/i })).toBeNull();
  });

  it('shows the existing gallery link with Copy above the create form', () => {
    renderModal({}, 'https://example.test/r/abc123');
    openGalleryTab();

    expect(
      screen.getByLabelText<HTMLInputElement>('Current gallery link URL').value
    ).toBe('https://example.test/r/abc123');
    expect(
      screen.getByRole('button', { name: /create new gallery link/i })
    ).toBeInTheDocument();
  });

  it('falls back to the long gallery URL without stamping a code when minting fails', async () => {
    mockCreateShortLink.mockResolvedValue({ ok: false });
    renderModal();
    await clickCreate();

    const codeWrite = setDocCalls().find((call) => call[1].latestShareCode);
    expect(codeWrite).toBeUndefined();

    const linkValue =
      screen.getByLabelText<HTMLInputElement>('Share link URL').value;
    expect(linkValue).toContain('/activity-wall/gallery/');
    expect(linkValue).not.toContain('/r/');
  });
});

describe('ActivityWallShareModal student link tab', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('opens on the student link with copy and QR actions', async () => {
    const onAddQr = vi.fn();
    render(
      <ActivityWallShareModal
        isOpen
        onClose={vi.fn()}
        entry={makeActivity()}
        sessionId="teacher-1_activity-1"
        teacherUid="teacher-1"
        studentUrl="https://example.test/activity-wall/teacher-1_activity-1"
        onAddQr={onAddQr}
      />
    );

    expect(screen.getByRole('tab', { name: 'Student link' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByLabelText<HTMLInputElement>('Student link URL').value
    ).toBe('https://example.test/activity-wall/teacher-1_activity-1');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        'Student link copied!',
        'success'
      )
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Add join QR to board' })
    );
    expect(onAddQr).toHaveBeenCalledTimes(1);
  });

  it('hides the QR action when onAddQr is not provided', () => {
    render(
      <ActivityWallShareModal
        isOpen
        onClose={vi.fn()}
        entry={makeActivity()}
        sessionId="teacher-1_activity-1"
        teacherUid="teacher-1"
        studentUrl="https://example.test/activity-wall/teacher-1_activity-1"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Add join QR to board' })
    ).toBeNull();
  });
});
