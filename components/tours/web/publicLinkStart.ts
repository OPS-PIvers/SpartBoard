import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

/** The web tour behind a public link, for a signed-in staff member; null when the link is off or the caller isn't staff. */
export async function setIdForPublicLink(
  token: string
): Promise<string | null> {
  const call = httpsCallable<{ token: string }, { setId: string }>(
    functions,
    'tourPublicLinkStartV1'
  );
  try {
    const { data } = await call({ token });
    return typeof data.setId === 'string' ? data.setId : null;
  } catch {
    return null;
  }
}
