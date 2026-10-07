// Building Hub landing page layout (T26), props only (mock: BuildingHubMock).

import React from 'react';
import { PAGE, Section } from '@/components/plc/redesignMockup/ui';
import type { PlcUpdate, TeamCardId } from '@/types';
import { LatestUpdatesView } from '../updates/LatestUpdatesCard';
import { CalendarCardView } from './CalendarCard';
import { QuickLinksView } from './QuickLinksCard';
import type { QuickLink } from './quickLinks';
import { ResourcesByCategoryView } from './ResourcesByCategoryCard';
import type { ResourceCategory } from './resourceCategories';

export interface BuildingHubViewProps {
  cards: TeamCardId[];
  isLead: boolean;
  myUid: string;
  hero: React.ReactNode;
  heroLabel: string;
  /** True when the hero already shows the calendar, so the card is skipped. */
  heroIsCalendar?: boolean;
  quickLinks: QuickLink[];
  latest: PlcUpdate[];
  myAcks: Record<string, number>;
  categories: ResourceCategory[];
  calendarUrl: string | undefined;
  calendarEmbed?: React.ReactNode;
  onAllUpdates?: () => void;
  onAllResources?: () => void;
}

export const BuildingHubView: React.FC<BuildingHubViewProps> = ({
  cards,
  isLead,
  myUid,
  hero,
  heroLabel,
  heroIsCalendar = false,
  quickLinks,
  latest,
  myAcks,
  categories,
  calendarUrl,
  calendarEmbed,
  onAllUpdates,
  onAllResources,
}) => {
  const on = (id: TeamCardId) => cards.includes(id);
  const showHero = on('hero') && !!hero;
  const showQuick = on('quickLinks') && (quickLinks.length > 0 || isLead);
  const showLatest = on('latestUpdates');
  const showResources = on('resourcesByCategory');
  const showCalendar =
    on('calendar') && !heroIsCalendar && calendarUrl !== undefined;
  const leftCol = showLatest || showResources;
  const twoCol = leftCol && showCalendar;

  return (
    <div className={PAGE}>
      {showHero && (
        <Section first label={heroLabel}>
          {hero}
        </Section>
      )}

      {showQuick && (
        <Section first={!showHero} label="Quick links" className="!py-4">
          <QuickLinksView
            links={quickLinks}
            isLead={isLead}
            onEdit={onAllResources}
          />
        </Section>
      )}

      {(leftCol || showCalendar) && (
        <Section
          first={!showHero && !showQuick}
          label="Updates, resources and calendar"
        >
          <div
            className={
              twoCol
                ? 'grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
                : ''
            }
          >
            {leftCol && (
              <div className="min-w-0">
                {showLatest && (
                  <LatestUpdatesView
                    updates={latest}
                    isLead={isLead}
                    myUid={myUid}
                    myAcks={myAcks}
                    onAll={onAllUpdates}
                  />
                )}
                {showResources && (
                  <div className={showLatest ? 'mt-8' : ''}>
                    <ResourcesByCategoryView
                      categories={categories}
                      onAll={onAllResources}
                    />
                  </div>
                )}
              </div>
            )}
            {showCalendar && (
              <div className="min-w-0">
                <CalendarCardView url={calendarUrl} embed={calendarEmbed} />
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
};
