// The Focus side panel's caller: a Chrome token mapped to a trusted SpartBoard account.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  storage: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
}));
vi.mock('../functionsInit', () => ({}));
vi.mock('../glTours', () => ({
  GL_TOURS_COLLECTION: 'building_guided_learning_tours',
}));

import * as firebaseAdmin from '../firebaseAdmin';
import { trustedUserForEmail } from '../trustedSignIn';
import { ExtensionCallError } from '../webTourExtension';
import { panelCaller, type PanelCallerDeps } from './panelCaller';

const CLIENT = 'client-123.apps.googleusercontent.com';
const EMAIL = 'teacher@orono.k12.mn.us';
const deps: PanelCallerDeps = {
  clientId: CLIENT,
  tokenInfo: () =>
    Promise.resolve({
      aud: CLIENT,
      azp: CLIENT,
      email: EMAIL,
      email_verified: 'true',
      expires_in: '3500',
    }),
  userForEmail: trustedUserForEmail,
};
const withUser = (user: object | Error) =>
  vi.mocked(firebaseAdmin.auth).mockReturnValue({
    getUserByEmail: () =>
      user instanceof Error ? Promise.reject(user) : Promise.resolve(user),
  } as never);
const status = async (p: Promise<unknown>): Promise<number> => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof ExtensionCallError ? e.status : -1;
  }
};

describe('panelCaller', () => {
  it("acts as the teacher's own Google account", async () => {
    withUser({
      uid: 'teacher-uid',
      emailVerified: true,
      displayName: 'Ms. Teacher',
      providerData: [{ providerId: 'google.com', email: EMAIL }],
    });
    expect(await panelCaller('t', deps)).toMatchObject({
      uid: 'teacher-uid',
      email: EMAIL,
      studentRole: false,
      name: 'Ms. Teacher',
    });
  });

  it('refuses a password-only or unverified account registered with the address', async () => {
    for (const user of [
      {
        uid: 'attacker',
        emailVerified: true,
        providerData: [{ providerId: 'password', email: EMAIL }],
      },
      {
        uid: 'attacker',
        emailVerified: false,
        providerData: [{ providerId: 'google.com', email: EMAIL }],
      },
    ]) {
      withUser(user);
      expect(await status(panelCaller('t', deps))).toBe(403);
    }
  });

  it('refuses a missing account and passes other Auth errors through', async () => {
    withUser(Object.assign(new Error('x'), { code: 'auth/user-not-found' }));
    expect(await status(panelCaller('t', deps))).toBe(403);
    withUser(new Error('down'));
    expect(await status(panelCaller('t', deps))).toBe(-1);
  });

  it('is unavailable without a client id', async () => {
    expect(await status(panelCaller('t', { ...deps, clientId: '' }))).toBe(503);
  });
});
