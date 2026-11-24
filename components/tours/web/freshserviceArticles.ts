import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';

const FRESHSERVICE_ARTICLES = 'freshservice_articles';

/** What the last send recorded about a tour's FreshService article (docs/plans/WEB_TOUR_AUTHORS.md L2). */
export interface FreshArticle {
  published: boolean;
  /** Where an agent opens the article; missing on records from before the address was kept. */
  url: string | null;
  sentAt: number;
}

/** A tour's FreshService state for the list: no article, a draft, a published article, or one older than the tour. */
export type FreshState = 'none' | 'draft' | 'published' | 'stale';

export const FRESH_LABEL: Record<Exclude<FreshState, 'none'>, string> = {
  draft: 'Draft',
  published: 'Published',
  stale: 'Needs update',
};

/** Only a FreshService agent address is ever linked. */
const ARTICLE_URL =
  /^https:\/\/[a-z0-9-]+\.freshservice\.com\/a\/solutions\/articles\/\d+$/;

export function freshArticleOf(data: unknown): FreshArticle | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.articleId !== 'number') return null;
  return {
    published: d.status === 2,
    url: typeof d.url === 'string' && ARTICLE_URL.test(d.url) ? d.url : null,
    sentAt: typeof d.sentAt === 'number' ? d.sentAt : 0,
  };
}

/** `publishedAt` is when the tour was last published in SpartBoard; null while it is a draft. */
export function freshStateOf(
  article: FreshArticle | undefined,
  publishedAt: number | null
): FreshState {
  if (!article) return 'none';
  if (publishedAt !== null && publishedAt > article.sentAt) return 'stale';
  return article.published ? 'published' : 'draft';
}

/** Every tour's article record by tour id, live; null while off, loading or refused. */
export function useFreshserviceArticles(
  enabled: boolean
): Record<string, FreshArticle> | null {
  const [articles, setArticles] = useState<Record<string, FreshArticle> | null>(
    null
  );
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, FRESHSERVICE_ARTICLES),
      (snap) => {
        const next: Record<string, FreshArticle> = {};
        snap.forEach((d) => {
          const article = freshArticleOf(d.data());
          if (article) next[d.id] = article;
        });
        setArticles(next);
      },
      (err) => {
        logError('useFreshserviceArticles', err);
        setArticles(null);
      }
    );
  }, [enabled]);
  return enabled ? articles : null;
}
