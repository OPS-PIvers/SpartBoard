import type { MiniAppSession } from '@/types';

export const MA_CONTENT_COLLECTION = 'content';
export const MA_CONTENT_DOC = 'app';

/** `mini_app_sessions/{id}/content/app`: what a per-period session hides until the period opens. */
export type MiniAppSessionContent = Pick<MiniAppSession, 'appHtml'>;

/** Folds the content doc into a per-period session; other sessions pass through unchanged. */
export function mergeMiniAppSessionContent<T extends MiniAppSession>(
  session: T,
  content: MiniAppSessionContent | null
): T {
  if (!session.appInContent || !content) return session;
  return {
    ...session,
    appHtml: typeof content.appHtml === 'string' ? content.appHtml : '',
  };
}
