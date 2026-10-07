// `quickLinks` landing card (T26): the team's saved links in one row.

import React from 'react';
import { TextLink } from '@/components/plc/redesignMockup/ui';
import type { TeamCardProps } from '../updates/teamContract';
import { quickLinkIcon, useQuickLinks, type QuickLink } from './quickLinks';

export const QuickLinksView: React.FC<{
  links: QuickLink[];
  isLead: boolean;
  onEdit?: () => void;
}> = ({ links, isLead, onEdit }) => (
  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
    {links.map((l) => (
      <TextLink
        key={l.id}
        icon={quickLinkIcon(l.title)}
        className="text-sm"
        onClick={() => window.open(l.url, '_blank', 'noopener,noreferrer')}
      >
        {l.title}
      </TextLink>
    ))}
    {isLead && (
      <TextLink quiet onClick={onEdit}>
        Edit links
      </TextLink>
    )}
  </div>
);

export default function QuickLinksCard({
  plc,
  isLead,
  onNavigate,
}: TeamCardProps) {
  const links = useQuickLinks(plc.id);
  if (links.length === 0 && !isLead) return null;
  return (
    <QuickLinksView
      links={links}
      isLead={isLead}
      onEdit={() => onNavigate?.('resources')}
    />
  );
}
