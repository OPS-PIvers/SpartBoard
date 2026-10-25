import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Auth, User } from 'firebase/auth';

const signInAnonymously = vi.fn();
vi.mock('firebase/auth', () => ({
  signInAnonymously: (auth: Auth) => signInAnonymously(auth) as unknown,
}));

import { dropPinLoginFromOtherSession } from '@/utils/pinLoginScope';

const anon = { isAnonymous: true } as User;
const custom = (claims: Record<string, unknown>) =>
  ({
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims }),
  }) as unknown as User;

function authWith(user: User | null) {
  const auth = { currentUser: user } as { currentUser: User | null };
  signInAnonymously.mockImplementation(() => {
    auth.currentUser = anon;
    return Promise.resolve();
  });
  return auth as unknown as Auth;
}

describe('dropPinLoginFromOtherSession', () => {
  beforeEach(() => signInAnonymously.mockReset());

  it('swaps a PIN token proven for another session back to anonymous', async () => {
    const auth = authWith(custom({ pinLogin: true, pinSessionId: 's-a' }));
    expect(await dropPinLoginFromOtherSession(auth, 's-b')).toBe(anon);
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it('keeps a PIN token in its own session, an SSO token, and an anonymous user', async () => {
    for (const user of [
      custom({ pinLogin: true, pinSessionId: 's-a' }),
      custom({ studentRole: true, sso: true }),
      anon,
    ]) {
      expect(await dropPinLoginFromOtherSession(authWith(user), 's-a')).toBe(
        user
      );
    }
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});
