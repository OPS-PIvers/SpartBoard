import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallShareModal } from './ShareModal';
import type { ActivityWallActivity } from '@/types';

// The share modal's form state is reset by remounting (a `key` on the call
// site), NOT by a props->state useEffect. These tests pin that behavior:
// every fresh open / activity switch must restore the default form values.

const { mockAddToast } = vi.hoisted(() => ({
  mockAddToast: vi.fn(),
}));

// ShareModal only reaches into useDashboard() for addToast.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: mockAddToast,
  }),
}));

// No Firestore calls happen in these tests (we never click "Create"), but the
// module is imported at the top of ShareModal, so stub it to a bare object.
vi.mock('@/config/firebase', () => ({
  db: {},
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
  overrides: Partial<ActivityWallActivity> = {}
): ActivityWallActivity => ({
  id: 'activity-1',
  title: 'Test Activity',
  prompt: 'Share your work',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  submissions: [],
  startedAt: 1,
  ...overrides,
});

/**
 * Harness that reproduces the production call site (Widget.tsx): the modal is
 * always mounted, shown/hidden via `isOpen`, and force-remounted by a `key`
 * that changes on the open-edge / activity change.
 */
const Harness: React.FC<{ activity: ActivityWallActivity }> = ({
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
        activity={activity}
        sessionId="session-1"
        teacherUid="teacher-1"
      />
    </>
  );
};

// The expiration checkbox is wrapped in a <label> that also contains the
// heading/body text, so multiple controls share that accessible region.
// Target it directly by its stable id to get an unambiguous, single node.
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
    expect(expirationCheckbox()).not.toBeChecked();
  });

  it('resets a mutated field after close + reopen (key flips)', () => {
    render(<Harness activity={makeActivity()} />);

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
    expect(expirationCheckbox()).not.toBeChecked();
  });

  it('resets a mutated field when the activity id changes (key flips)', () => {
    const { rerender } = render(
      <Harness activity={makeActivity({ id: 'activity-1' })} />
    );

    fireEvent.click(expirationCheckbox());
    expect(expirationCheckbox()).toBeChecked();

    // Switching to a different activity id changes the modal's key and remounts
    // it (same edge the production call site keys on).
    rerender(<Harness activity={makeActivity({ id: 'activity-2' })} />);

    expect(expirationCheckbox()).not.toBeChecked();
  });
});
