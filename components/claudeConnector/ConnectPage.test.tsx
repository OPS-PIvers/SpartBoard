import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callable,
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/utils/googleOAuthRefresh', () => ({
  refreshAccessTokenViaBackend: () => Promise.resolve({ status: 'ok' }),
}));

let authUser: { uid: string } | null = null;
const signInWithGoogle = vi.fn();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: authUser,
    loading: false,
    signInWithGoogle,
    signOut: vi.fn(),
    captureOfflineGrant: vi.fn(),
  }),
}));

import { ConnectPage } from './ConnectPage';

describe('ConnectPage', () => {
  beforeEach(() => {
    authUser = null;
    window.history.replaceState(
      null,
      '',
      '/connect?response_type=code&client_id=c&redirect_uri=r&code_challenge=x&code_challenge_method=S256&state=s&resource=m'
    );
    callable.mockImplementation((req: { decision: string }) =>
      Promise.resolve({
        data:
          req.decision === 'preview'
            ? {
                decision: 'preview',
                clientName: 'Claude',
                email: 't@orono.k12.mn.us',
                eligible: true,
                reason: null,
              }
            : { decision: 'approve', redirectTo: 'https://claude.ai/cb' },
      })
    );
  });

  it('leaves Allow clickable after signing in on this page', async () => {
    let finishSignIn: () => void = () => undefined;
    signInWithGoogle.mockImplementation(
      () => new Promise<void>((resolve) => (finishSignIn = resolve))
    );
    const { rerender } = render(<ConnectPage />);
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with google/i })
    );
    authUser = { uid: 'u1' };
    act(() => {
      finishSignIn();
      rerender(<ConnectPage />);
    });
    const allow = await screen.findByRole('button', { name: 'Allow' });
    expect(allow).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('shows the SpartBoard logo, not a generic icon', async () => {
    authUser = { uid: 'u1' };
    const { container } = render(<ConnectPage />);
    await screen.findByRole('button', { name: 'Allow' });
    await waitFor(() =>
      expect(container.querySelector('img[src="/icon-128.png"]')).not.toBeNull()
    );
  });
});
