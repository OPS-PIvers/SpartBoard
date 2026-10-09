import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Link2, Loader2 } from 'lucide-react';
import type { HelpResourceItem } from '@/types/helpCenter';
import { useAuth } from '@/context/useAuth';
import { useCreateShortLink } from '@/hooks/useShortLinks';
import { resolveShortLink } from '@/utils/shortLinksApi';
import { buildShortUrl } from '@/utils/shortLinkValidation';
import { logError } from '@/utils/logError';
import { buildHelpItemUrl, helpShortLinkCode } from './helpCenterState';
import { tourAttr } from '@/config/tourAnchors';

interface HelpCopyLinkButtonProps {
  item: HelpResourceItem;
  variant: 'icon' | 'text';
}

export const HelpCopyLinkButton: React.FC<HelpCopyLinkButtonProps> = ({
  item,
  variant,
}) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
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

  if (!isAdmin) return null;

  const getShareUrl = async (): Promise<string> => {
    const destination = buildHelpItemUrl(item.id);
    const code = helpShortLinkCode(item.id);
    try {
      const existing = await resolveShortLink(code);
      if (existing?.destination === destination) return buildShortUrl(code);
      const result = await createShortLink({
        destination,
        slug: existing ? undefined : code,
        label: `Help: ${item.title}`,
      });
      if (result.ok) return buildShortUrl(result.link.code);
      // Another admin may have claimed the code a moment ago.
      const raced = await resolveShortLink(code);
      if (raced?.destination === destination) return buildShortUrl(code);
    } catch (err) {
      logError('HelpCopyLinkButton.shortLink', err, { itemId: item.id });
    }
    return destination;
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'working') return;
    setState('working');
    try {
      const url = await getShareUrl();
      await navigator.clipboard.writeText(url);
      setState('done');
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => setState('idle'), 1500);
    } catch (err) {
      logError('HelpCopyLinkButton.clipboard', err, { itemId: item.id });
      setState('idle');
    }
  };

  const icon =
    state === 'working' ? (
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
    ) : state === 'done' ? (
      <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
    ) : (
      <Link2 className="w-4 h-4" aria-hidden="true" />
    );
  const label =
    state === 'done'
      ? t('helpCenter.guides.linkCopied')
      : t('helpCenter.guides.copyLink');

  if (variant === 'icon') {
    return (
      <button
        {...tourAttr('help-center.guides.copy-link')}
        type="button"
        onClick={(e) => void handleClick(e)}
        aria-label={t('helpCenter.guides.copyLinkFor', { title: item.title })}
        title={label}
        className="shrink-0 self-center p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-blue-primary transition-colors"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      {...tourAttr('help-center.viewer.copy-link')}
      type="button"
      onClick={(e) => void handleClick(e)}
      className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
};
