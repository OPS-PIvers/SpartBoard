import { useEffect, useRef, useState } from 'react';
import { useCreateShortLink } from '@/hooks/useShortLinks';
import { resolveShortLink } from '@/utils/shortLinksApi';
import { buildShortUrl } from '@/utils/shortLinkValidation';
import { logError } from '@/utils/logError';

export interface ShortLinkTarget {
  destination: string;
  /** One code per target, so every copy adds to the same click count. */
  code: string;
  label: string;
}

/** Copies a stable /r/ link to the clipboard, falling back to the full address. */
export function useCopyShortLink(logContext: string): {
  state: 'idle' | 'working' | 'done';
  copy: (target: ShortLinkTarget) => Promise<void>;
} {
  const { createShortLink } = useCreateShortLink();
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const resetTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    []
  );

  const getShareUrl = async ({
    destination,
    code,
    label,
  }: ShortLinkTarget): Promise<string> => {
    try {
      const existing = await resolveShortLink(code);
      if (existing?.destination === destination) return buildShortUrl(code);
      const result = await createShortLink({
        destination,
        slug: existing ? undefined : code,
        label,
      });
      if (result.ok) return buildShortUrl(result.link.code);
      // Another admin may have claimed the code a moment ago.
      const raced = await resolveShortLink(code);
      if (raced?.destination === destination) return buildShortUrl(code);
    } catch (err) {
      logError(`${logContext}.shortLink`, err, { code });
    }
    return destination;
  };

  const copy = async (target: ShortLinkTarget) => {
    if (state === 'working') return;
    setState('working');
    try {
      await navigator.clipboard.writeText(await getShareUrl(target));
      setState('done');
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => setState('idle'), 1500);
    } catch (err) {
      logError(`${logContext}.clipboard`, err, { code: target.code });
      setState('idle');
    }
  };

  return { state, copy };
}
