// Mentoring `programHub` landing page (T30, T34): hero, then the layout's cards.

import React, { createElement } from 'react';
import type { TeamCardId } from '@/types';
import NextRequiredTaskHero from './NextRequiredTaskHero';
import NextTaskCard from './NextTaskCard';
import ProgramResourcesCard from './ProgramResourcesCard';
import { ProgramHubView } from './ProgramHubView';
import SubmissionStatusCard from './SubmissionStatusCard';
import { foreignCard, foreignHero } from './teamRegistryBridge';
import type { TeamCardProps, TeamNav, TeamPageProps } from './teamContract';

const OWN_CARDS: Partial<
  Record<TeamCardId, React.ComponentType<TeamCardProps>>
> = {
  submissionStatus: SubmissionStatusCard,
  nextTask: NextTaskCard,
  resourcesByCategory: ProgramResourcesCard,
};

/** Cards that sit in the narrow side column; everything else is main. */
const SIDE: ReadonlySet<TeamCardId> = new Set([
  'calendar',
  'resourcesByCategory',
  'quickLinks',
]);

export default function ProgramHubPage({
  plc,
  layout,
  isLead,
  onNavigate,
  onEditLayout,
}: TeamPageProps & TeamNav) {
  const main: React.ReactNode[] = [];
  const side: React.ReactNode[] = [];
  for (const id of layout.cards) {
    if (id === 'hero') continue;
    if (id === (isLead ? 'nextTask' : 'submissionStatus')) continue;
    const Card = OWN_CARDS[id] ?? foreignCard(id);
    if (!Card) continue;
    // Registry components are stable module-level references.
    (SIDE.has(id) ? side : main).push(
      createElement(Card, { key: id, plc, isLead })
    );
  }
  let hero: React.ReactNode = null;
  if (layout.cards.includes('hero')) {
    const pinned = layout.hero.mode === 'pinned' ? layout.hero.ref : undefined;
    const Pinned = pinned ? foreignHero(pinned.kind) : null;
    hero =
      Pinned && pinned ? (
        createElement(Pinned, { plc, heroRef: pinned, isLead })
      ) : (
        <NextRequiredTaskHero
          plc={plc}
          heroRef={null}
          isLead={isLead}
          onNavigate={onNavigate}
          onEditLayout={onEditLayout}
        />
      );
  }
  return <ProgramHubView hero={hero} main={main} side={side} />;
}
