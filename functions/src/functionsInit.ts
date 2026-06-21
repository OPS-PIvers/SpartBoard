/**
 * Shared Firebase Admin + global-options bootstrap for the callables that used
 * to live inline in `index.ts` (F12 split).
 *
 * `admin.initializeApp()` MUST run exactly once per process. Every leaf module
 * extracted from the old monolith imports this module, and the guard on
 * `admin.apps.length` makes repeated imports a no-op — matching the pattern the
 * pre-existing Phase-4 modules (`organizationInvites.ts`, etc.) already use.
 * Whichever module is imported first wins; the rest no-op.
 *
 * `setGlobalOptions({ region: 'us-central1' })` is likewise idempotent and is
 * pinned here so every callable inherits the region regardless of which module
 * the deploy entrypoint imports first.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

setGlobalOptions({ region: 'us-central1' });

if (admin.apps.length === 0) {
  admin.initializeApp();
}
