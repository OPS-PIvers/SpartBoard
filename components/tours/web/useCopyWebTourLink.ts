import { useCallback, useEffect, useEffectEvent } from 'react';
import { useCreateShortLink } from '@/hooks/useShortLinks';
import { resolveShortLink } from '@/utils/shortLinksApi';
import { buildShortUrl } from '@/utils/shortLinkValidation';
import { logError } from '@/utils/logError';
import { buildTourUrl, tourShortLinkCode } from './tourLinks';
import { copyText } from '@/utils/copyText';

/** Copies a web tour's `/r/tour-...` short link, or its `/tour/{setId}` address when no short link can be made. */
export function useCopyWebTourLink(): (
  setId: string,
  title: string
) => Promise<boolean> {
  const { createShortLink } = useCreateShortLink();

  const shareUrl = useCallback(
    async (setId: string, title: string): Promise<string> => {
      const destination = buildTourUrl(setId);
      const code = tourShortLinkCode(setId);
      try {
        const existing = await resolveShortLink(code);
        if (existing?.destination === destination) return buildShortUrl(code);
        const result = await createShortLink({
          destination,
          slug: existing ? undefined : code,
          label: `Web tour: ${title}`,
        });
        if (result.ok) return buildShortUrl(result.link.code);
        // Another admin may have claimed the code a moment ago.
        const raced = await resolveShortLink(code);
        if (raced?.destination === destination) return buildShortUrl(code);
      } catch (err) {
        logError('useCopyWebTourLink.shortLink', err, { setId });
      }
      return destination;
    },
    [createShortLink]
  );

  return useCallback(
    async (setId: string, title: string): Promise<boolean> => {
      const log = (err: unknown) =>
        logError('useCopyWebTourLink.clipboard', err, { setId });
      try {
        return await copyText(await shareUrl(setId, title), log);
      } catch (err) {
        log(err);
        return false;
      }
    },
    [shareUrl]
  );
}

/** Copies one web tour's link when mounted, then reports; lets a provider-optional screen copy without the auth hook. */
export function CopyWebTourLinkTask({
  setId,
  title,
  onDone,
}: {
  setId: string;
  title: string;
  onDone: (copied: boolean) => void;
}): null {
  const copy = useCopyWebTourLink();
  const done = useEffectEvent(onDone);
  useEffect(() => {
    let cancelled = false;
    void copy(setId, title).then((ok) => {
      if (!cancelled) done(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [copy, setId, title]);
  return null;
}
