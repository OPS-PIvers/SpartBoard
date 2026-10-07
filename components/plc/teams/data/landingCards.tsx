// Landing cards this slice owns, per the B1 card contract; each reads live data and renders only under teams-redesign.

import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
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
import { useDataOverviewModel, usePlcNavigation } from './useDataOverview';

const useFlag = () => useAuth().canAccessFeature('teams-redesign');

export function DistributionCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  if (!useFlag()) return null;
  return model.featured ? (
    <DistributionView featured={model.featured} />
  ) : (
    <NoResults />
  );
}

export function TrendCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  if (!useFlag()) return null;
  return <TrendView trend={model.trend} shortTitles={model.shortTitles} />;
}

export function ParticipationCard({ plc }: TeamCardProps) {
  const { model } = useDataOverviewModel(plc, null);
  if (!useFlag()) return null;
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
  if (!useFlag() || !model.featured) return null;
  if (!model.mastery && !isLead) return null;
  return (
    <>
      {model.mastery ? (
        <MasteryView
          layer={model.mastery}
          isLead={isLead}
          onManageTargets={() => setOpen(true)}
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
  if (!useFlag()) return null;
  return (
    <RecentAssessmentsView
      rows={model.recent}
      onOpen={nav.openAssessment}
      onAll={nav.allAssessments}
    />
  );
}

export function GoalsCard({ plc, isLead }: TeamCardProps) {
  if (!useFlag()) return null;
  return <GoalSection plc={plc} isLead={isLead} />;
}
