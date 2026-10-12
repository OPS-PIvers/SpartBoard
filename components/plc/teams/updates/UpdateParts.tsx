// Shared pieces of an update: body, attachment and link, and the reaction button (mock: BuildingMock.tsx).

import React from 'react';
import { ExternalLink, Paperclip, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { TextLink } from '@/components/plc/redesignMockup/ui';
import type { PlcUpdate } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';

const openExternal = (url: string) =>
  window.open(url, '_blank', 'noopener,noreferrer');

const linkHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const UpdateBody: React.FC<{ update: PlcUpdate }> = ({ update }) => (
  <>
    {update.body && (
      <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-700">
        {update.body}
      </p>
    )}
    {update.attachment && (
      <p className="mt-2 flex items-center gap-1.5 text-sm">
        <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <TextLink
          className="text-sm"
          {...tourFieldAttr(
            'teams.update.open-attachment',
            'teams-updates',
            update.id
          )}
          onClick={() =>
            update.attachment && openExternal(update.attachment.url)
          }
        >
          {update.attachment.name}
        </TextLink>
      </p>
    )}
    {update.linkUrl && (
      <p className="mt-2 flex items-center gap-1.5 text-sm">
        <ExternalLink
          className="h-3.5 w-3.5 text-slate-400"
          aria-hidden="true"
        />
        <TextLink
          className="text-sm"
          {...tourFieldAttr(
            'teams.update.open-link',
            'teams-updates',
            update.id
          )}
          onClick={() => update.linkUrl && openExternal(update.linkUrl)}
        >
          {linkHost(update.linkUrl)}
        </TextLink>
      </p>
    )}
  </>
);

export const ReactionButton: React.FC<{
  count: number;
  reacted: boolean;
  onToggle?: () => void;
  anchorKey?: string;
}> = ({ count, reacted, onToggle, anchorKey = '' }) => (
  <Button
    variant="ghost"
    size="sm"
    icon={
      <ThumbsUp
        className={`h-3.5 w-3.5 ${reacted ? 'fill-current' : ''}`}
        aria-hidden="true"
      />
    }
    aria-label={`${count} reactions`}
    aria-pressed={reacted}
    {...tourFieldAttr('teams.update.react', 'teams-updates', anchorKey)}
    onClick={onToggle}
  >
    {count}
  </Button>
);
