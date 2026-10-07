// The `dataOverview` team page (T16–T21), live on plcs/{id}/aggregates; renders only under teams-redesign.

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { usePlcAggregate } from '@/hooks/usePlcAggregate';
import { usePlcAssessments } from '@/hooks/usePlcAssessments';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { Section } from '@/components/plc/redesignMockup/ui';
import { DataOverviewView } from './DataOverviewView';
import { ManageTargetsModal } from './ManageTargetsModal';
import {
  AssessmentHeroFromModel,
  GoalSection,
  TargetHeroFromInput,
} from './heroes';
import { buildTagQuestionSets } from './dataOverviewModel';
import type { TeamPageProps } from '@/components/plc/teams/types';
import { TeamHeroRegion } from '@/components/plc/teams/heroes/TeamHeroRegion';
import { useTeamShellActions } from './teamShellActions';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import {
  useDataOverviewModel,
  useMeetingStrip,
  usePlcNavigation,
} from './useDataOverview';

/** Manage targets on the team's live list; question tags come from the aggregates. */
export const ManageTargetsForPlc: React.FC<{
  plcId: string;
  onClose: () => void;
}> = ({ plcId, onClose }) => {
  const targets = usePlcLearningTargets(plcId);
  const { aggregates } = usePlcAggregate(plcId);
  const { assessments } = usePlcAssessments(plcId);
  const sets = useMemo(
    () => buildTagQuestionSets(aggregates, assessments),
    [aggregates, assessments]
  );
  if (targets.loading) return null;
  return (
    <ManageTargetsModal
      list={targets.list}
      questionSets={sets}
      onSave={targets.save}
      onClose={onClose}
    />
  );
};

export default function DataOverviewPage({
  plc,
  layout,
  isLead,
  onChangeHero,
  onNavigate,
}: TeamPageProps) {
  const { canAccessFeature } = useAuth();
  const heroRef =
    layout.hero.mode === 'pinned' ? (layout.hero.ref ?? null) : null;
  const { model, input } = useDataOverviewModel(plc, heroRef);
  const strip = useMeetingStrip(plc);
  const nav = usePlcNavigation(plc.id);
  const { openMyItems } = useTeamShellActions();
  const teamNav = useTeamNav();
  const [targetsOpen, setTargetsOpen] = useState(false);

  if (!canAccessFeature('teams-redesign')) return null;

  // Pins this page doesn't draw itself (docs, notes, updates, calendar) go through the shared hero dispatch.
  const ownsPin =
    !heroRef ||
    heroRef.kind === 'assessment' ||
    heroRef.kind === 'target' ||
    heroRef.kind === 'goal';
  const hero = !ownsPin ? (
    <Section first>
      <TeamHeroRegion
        plc={plc}
        layout={layout}
        isLead={isLead}
        onChangeHero={onChangeHero}
        onNavigate={onNavigate}
      />
    </Section>
  ) : heroRef?.kind === 'target' ? (
    <TargetHeroFromInput
      input={input}
      model={model}
      targetId={heroRef.targetId}
      isLead={isLead}
      pinnedBy={heroRef ? layout.hero.pinnedBy?.name : undefined}
    />
  ) : heroRef?.kind === 'goal' ? (
    <Section first>
      <GoalSection
        plc={plc}
        isLead={isLead}
        goalId={heroRef.goalId}
        hero
        pinned
        pinnedBy={layout.hero.pinnedBy?.name}
      />
    </Section>
  ) : (
    <AssessmentHeroFromModel
      plc={plc}
      model={model}
      isLead={isLead}
      pinnedBy={heroRef ? layout.hero.pinnedBy?.name : undefined}
    />
  );

  return (
    <>
      <DataOverviewView
        model={model}
        isLead={isLead}
        cards={layout.cards}
        hero={hero}
        goal={
          heroRef?.kind === 'goal' ? null : (
            <GoalSection plc={plc} isLead={isLead} />
          )
        }
        strip={{
          ...strip,
          onOpenNote: nav.openNotes,
          onViewItems: openMyItems ?? nav.openNotes,
        }}
        onManageTargets={() => teamNav.navigate('targets')}
        onTagQuestions={() => setTargetsOpen(true)}
        onOpenAssessment={nav.openAssessment}
        onAllAssessments={nav.allAssessments}
      />
      {targetsOpen && (
        <ManageTargetsForPlc
          plcId={plc.id}
          onClose={() => setTargetsOpen(false)}
        />
      )}
    </>
  );
}
