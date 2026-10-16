// Landing cards this slice owns, per the B1 card contract; each reads live data.

import React, { useState } from 'react';
import {
  DistributionView,
  MasteryView,
  NoResults,
  ParticipationView,
  RecentAssessmentsView,
  TagPrompt,
  TrendView,
} from './DataOverviewSections';
import { GoalSection } from './heroes';
import { ManageTargetsForPlc } from './DataOverviewPage';
import type { TeamCardProps } from '@/components/plc/teams/types';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import { useDataOverviewModel, usePlcNavigation } from './useDataOverview';

export function DistributionCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  return model.featured ? (
    <DistributionView featured={model.featured} />
  ) : (
    <NoResults />
  );
}

export function TrendCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  return <TrendView trend={model.trend} shortTitles={model.shortTitles} />;
}

export function ParticipationCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  return (
    <ParticipationView
      rows={model.participation}
      shortTitles={model.shortTitles}
    />
  );
}

/** Mastery when tagged; the lead's tag prompt when not; nothing for members (T18). */
export function MasteryByTargetCard({ plc, isLead }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  const [open, setOpen] = useState(false);
  const teamNav = useTeamNav();
  if (!model.featured) return null;
  if (!model.mastery && !isLead) return null;
  return (
    <>
      {model.mastery ? (
        <MasteryView
          layer={model.mastery}
          isLead={isLead}
          onManageTargets={() => teamNav.navigate('targets')}
        />
      ) : (
        <TagPrompt onTag={() => setOpen(true)} />
      )}
      {open && (
        <ManageTargetsForPlc plcId={plc.id} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function RecentAssessmentsCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  const nav = usePlcNavigation(plc.id);
  return (
    <RecentAssessmentsView
      rows={model.recent}
      onOpen={nav.openAssessment}
      onAll={nav.allAssessments}
    />
  );
}

export function GoalsCard({ plc, isLead }: TeamCardProps) {
  return <GoalSection plc={plc} isLead={isLead} />;
}
