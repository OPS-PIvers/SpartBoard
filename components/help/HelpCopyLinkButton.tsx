import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Link2, Loader2 } from 'lucide-react';
import type { HelpResourceItem } from '@/types/helpCenter';
import { useAuth } from '@/context/useAuth';
import { useCopyShortLink } from '@/hooks/useCopyShortLink';
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
  const { state, copy } = useCopyShortLink('HelpCopyLinkButton');

  if (!isAdmin) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copy({
      destination: buildHelpItemUrl(item.id),
      code: helpShortLinkCode(item.id),
      label: `Help: ${item.title}`,
    });
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
