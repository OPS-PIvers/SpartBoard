// Who a Focus side panel request comes from: the Chrome token's district email, mapped to a trusted SpartBoard account.
import { trustedUserForEmail } from '../trustedSignIn';
import {
  DISTRICT_DOMAIN,
  EXTENSION_OAUTH_CLIENTS,
  ExtensionCallError,
  fetchTokenInfo,
  verifiedTokenEmail,
  type ExtensionDeps,
} from '../extensionAuth';
import type { FocusCaller } from './sessions';

const SIGN_IN = 'Sign in to Chrome with your Orono account.';

export interface PanelCallerDeps extends Pick<
  ExtensionDeps,
  'clientId' | 'tokenInfo'
> {
  userForEmail: typeof trustedUserForEmail;
}

const liveDeps = (): PanelCallerDeps => ({
  clientId: EXTENSION_OAUTH_CLIENTS[process.env.GCLOUD_PROJECT ?? ''] ?? '',
  tokenInfo: fetchTokenInfo,
  userForEmail: trustedUserForEmail,
});

/** The staff member a side panel token belongs to, as the callables see a signed-in teacher (H7). */
export async function panelCaller(
  token: string,
  deps: PanelCallerDeps = liveDeps()
): Promise<FocusCaller> {
  if (!deps.clientId)
    throw new ExtensionCallError(503, 'Focus is not set up yet.');
  const email = await verifiedTokenEmail(token, deps, DISTRICT_DOMAIN, SIGN_IN);
  // Any Auth error other than a missing account is a 500, which the panel treats as offline and retries.
  const user = await deps.userForEmail(email);
  if (!user)
    throw new ExtensionCallError(
      403,
      'Sign in to SpartBoard once, then try again.'
    );
  return {
    uid: user.uid,
    email,
    emailVerified: true,
    anonymous: false,
    studentRole: user.customClaims?.studentRole === true,
    name: user.displayName ?? null,
  };
}
