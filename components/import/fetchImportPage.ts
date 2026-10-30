import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type {
  ImportInboxItem,
  ImportSendRequest,
} from '@/utils/import/contract';

/** `fetchImportPageV1` reply (functions/src/importPageFetch.ts). */
export type ImportPageFetchResult =
  | { status: 'ok'; page: ImportSendRequest }
  | { status: 'blocked' }
  | { status: 'not-a-page'; contentType: string }
  | {
      status: 'use-extension';
      reason: 'sign-in' | 'refused' | 'unreachable' | 'no-content';
    };

/** What the window knows about a dropped link's page. */
export type DroppedPage =
  | { status: 'reading' }
  | { status: 'read'; item: ImportInboxItem }
  | { status: 'blocked' }
  | { status: 'use-extension' }
  | { status: 'plain' };

/** Reads a dropped public link on the server (D17); any failure leaves it a plain link. */
export async function readDroppedPage(url: string): Promise<DroppedPage> {
  try {
    const call = httpsCallable<{ url: string }, ImportPageFetchResult>(
      functions,
      'fetchImportPageV1'
    );
    const { data } = await call({ url });
    if (data.status === 'ok')
      return {
        status: 'read',
        item: {
          ...data.page,
          id: `page:${data.page.url}`,
          receivedAt: Date.now(),
        },
      };
    if (data.status === 'blocked') return { status: 'blocked' };
    if (data.status === 'use-extension') return { status: 'use-extension' };
    return { status: 'plain' };
  } catch (err) {
    console.error('[Import] could not read the dropped page', err);
    return { status: 'plain' };
  }
}
