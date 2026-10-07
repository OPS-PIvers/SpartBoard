// The landing page hero: dispatches the pinned item or the type's default rule to its renderer.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { getPlcGroupType, type Plc } from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import { TeamCardPlaceholder } from '@/components/plc/teams/TeamPlaceholder';
import {
  teamHeroKindLabel,
  teamHeroRuleLabel,
} from '@/components/plc/teams/teamLabels';
import { resolveTeamHeroEntry } from './heroRegistry';
import { HeroStaleNudge } from './HeroStaleNudge';

export const TeamHeroRegion: React.FC<{
  plc: Plc;
  layout: ResolvedTeamLayout;
  isLead: boolean;
}> = ({ plc, layout, isLead }) => {
  const { t } = useTranslation();
  const heroRef =
    layout.hero.mode === 'pinned' ? (layout.hero.ref ?? null) : null;
  const pinnedBy = heroRef ? layout.hero.pinnedBy : undefined;
  const entry = resolveTeamHeroEntry(
    heroRef,
    layout.heroRule,
    getPlcGroupType(plc)
  );
  return (
    <div data-team-hero>
      {!entry?.ownsNudge && (
        <HeroStaleNudge
          plc={plc}
          layout={layout}
          isLead={isLead}
          className="mb-3"
        />
      )}
      {entry ? (
        entry.render({ plc, heroRef, pinnedBy, isLead })
      ) : (
        <TeamCardPlaceholder
          label={
            heroRef
              ? teamHeroKindLabel(t, heroRef.kind)
              : teamHeroRuleLabel(t, layout.heroRule)
          }
        />
      )}
    </div>
  );
};
