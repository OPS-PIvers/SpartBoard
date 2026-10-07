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
import type { TeamPageProps } from './teamContract';
import { useTeamShellActions } from './teamShellActions';
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
}: TeamPageProps) {
  const { canAccessFeature } = useAuth();
  const heroRef =
    layout.hero.mode === 'pinned' ? (layout.hero.ref ?? null) : null;
  const { model, input } = useDataOverviewModel(plc, heroRef);
  const strip = useMeetingStrip(plc);
  const nav = usePlcNavigation(plc.id);
  const { openMyItems } = useTeamShellActions();
  const [targetsOpen, setTargetsOpen] = useState(false);

  if (!canAccessFeature('teams-redesign')) return null;

  const hero =
    heroRef?.kind === 'target' ? (
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
        goal={<GoalSection plc={plc} isLead={isLead} />}
        strip={{
          ...strip,
          onOpenNote: nav.openNotes,
          onViewItems: openMyItems ?? nav.openNotes,
        }}
        onManageTargets={() => setTargetsOpen(true)}
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
