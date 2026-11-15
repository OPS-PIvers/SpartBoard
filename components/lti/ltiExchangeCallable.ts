import { httpsCallableFromURL } from 'firebase/functions';
import { functions } from '@/config/firebase';

/** ltiExchange through the same-origin /lti/exchange rewrite, so the launch's browser-binding cookie goes with it. */
export function ltiExchangeCallable<T>() {
  return httpsCallableFromURL<{ code: string }, T>(
    functions,
    `${window.location.origin}/lti/exchange`
  );
}
