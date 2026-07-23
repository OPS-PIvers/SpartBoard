import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Regression: InviteAcceptance's default-branch error message is built from a
// plain JS string literal containing the raw HTML entity `&rsquo;`
// ("We couldn&rsquo;t accept this invitation..."). Unlike JSX text children
// (which the JSX transform decodes as HTML), a plain string interpolated via
// `{message}` is inserted into the DOM verbatim — so users hit with any
// unrecognized claim-error code see the literal characters "&rsquo;" instead
// of an apostrophe. Reproduce by forcing the claim callable to reject with a
// code outside the four explicitly-handled cases (falls through to the
// "Something went wrong" default branch).

const mockClaim = vi.fn();

vi.mock('@/config/firebase', () => ({
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockClaim,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'teacher@example.com' },
    loading: false,
    signOut: vi.fn(),
  }),
}));

import { InviteAcceptance } from '@/components/auth/InviteAcceptance';

describe('InviteAcceptance default error message', () => {
  beforeEach(() => {
    mockClaim.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, pathname: '/invite/tok123', search: '' },
    });
  });

  it('renders a real apostrophe, not the literal "&rsquo;" entity, for an unhandled claim error code', async () => {
    mockClaim.mockRejectedValue(
      Object.assign(new Error('boom'), { code: 'functions/internal' })
    );

    render(<InviteAcceptance />);

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    const message = await screen.findByText(/accept this invitation/i);
    expect(message.textContent).not.toContain('&rsquo;');
    expect(message.textContent).toContain("couldn't accept this invitation");
  });
});
