// Building Hub (T25, T26): the `hub` landing page for building teams; the registry picks it by group type.

import React from 'react';
import { LATEST_UPDATES_COUNT, pickHeroUpdate } from '@/utils/teamUpdates';
import { UpdateHeroView } from '../updates/UpdateHero';
import { useTeamUpdatesData } from '../updates/useTeamUpdatesData';
import type { TeamPageProps } from '../updates/teamContract';
import { BuildingHubView } from './BuildingHubView';
import { CalendarHeroView } from './CalendarCard';
import { useQuickLinks } from './quickLinks';
import { useResourceCategories } from './resourceCategories';

export function BuildingHubPage({
  plc,
  layout,
  isLead,
  onNavigate,
  onChangeHero,
}: TeamPageProps) {
  const { updates, myUid, myAcks, onReact } = useTeamUpdatesData(plc, isLead, {
    withRosters: false,
    visible: LATEST_UPDATES_COUNT + 1,
  });
  const quickLinks = useQuickLinks(plc.id);
  const categories = useResourceCategories(plc.id);

  const ref = layout.hero.mode === 'pinned' ? layout.hero.ref : undefined;
  const heroIsCalendar = ref?.kind === 'calendar';
  // Pinned items of other kinds (docs, goals) are drawn by the shell's hero dispatcher.
  const heroUpdate =
    !heroIsCalendar && (!ref || ref.kind === 'update')
      ? pickHeroUpdate(
          updates,
          ref?.kind === 'update' ? ref.updateId : undefined
        )
      : null;

  const hero = heroIsCalendar ? (
    <CalendarHeroView
      url={plc.calendarEmbedUrl}
      isLead={isLead}
      onChange={onChangeHero}
    />
  ) : heroUpdate ? (
    <UpdateHeroView
      update={heroUpdate}
      isLead={isLead}
      myUid={myUid}
      onChange={onChangeHero}
      onReact={onReact}
    />
  ) : null;

  return (
    <BuildingHubView
      cards={layout.cards}
      isLead={isLead}
      myUid={myUid}
      hero={hero}
      heroLabel={heroIsCalendar ? 'Calendar' : 'Pinned update'}
      heroIsCalendar={heroIsCalendar}
      quickLinks={quickLinks}
      latest={updates
        .filter((u) => u.id !== heroUpdate?.id)
        .slice(0, LATEST_UPDATES_COUNT)}
      myAcks={myAcks}
      categories={categories}
      calendarUrl={plc.calendarEmbedUrl}
      onAllUpdates={() => onNavigate?.('updates')}
      onAllResources={() => onNavigate?.('resources')}
    />
  );
}

export default BuildingHubPage;
