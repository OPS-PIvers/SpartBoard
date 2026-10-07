// Default landing page (T4): the hero, then the layout's cards in order from the card registry.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { getPlcGroupType } from '@/types';
import { PAGE, Section } from '@/components/plc/redesignMockup/ui';
import { TeamHeroRegion } from '@/components/plc/teams/heroes/TeamHeroRegion';
import { TeamCardPlaceholder } from '@/components/plc/teams/TeamPlaceholder';
import { teamCardLabel } from '@/components/plc/teams/teamLabels';
import type {
  TeamCardRegistry,
  TeamPageProps,
} from '@/components/plc/teams/types';
import { TEAM_CARD_REGISTRY } from '@/components/plc/teams/cardRegistry';
import { SPAN_COLUMNS, packLandingRows } from './landingRows';

const COL_SPAN: Record<number, string> = {
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  6: 'md:col-span-6',
};

export const TeamLandingPage: React.FC<
  TeamPageProps & { cards?: TeamCardRegistry }
> = ({ plc, layout, isLead, cards = TEAM_CARD_REGISTRY }) => {
  const { t } = useTranslation();
  const groupType = getPlcGroupType(plc);
  const rows = packLandingRows(layout.cards, cards);
  return (
    <div className={PAGE}>
      {rows.map((row, i) => (
        <Section key={row.join('|')} first={i === 0}>
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-6">
            {row.map((id) => {
              if (id === 'hero') {
                return (
                  <div key={id} className="min-w-0 md:col-span-6">
                    <TeamHeroRegion plc={plc} layout={layout} isLead={isLead} />
                  </div>
                );
              }
              const { Component, span } = cards[id];
              return (
                <div
                  key={id}
                  className={`min-w-0 ${COL_SPAN[SPAN_COLUMNS[span]]}`}
                  data-team-card={id}
                >
                  {Component ? (
                    <Component plc={plc} isLead={isLead} />
                  ) : (
                    <TeamCardPlaceholder
                      label={teamCardLabel(t, id, groupType)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
};
