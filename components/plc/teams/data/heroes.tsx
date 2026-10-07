// Hero renderers this slice owns (T5, T6, T19, T21): assessment, target, goal, and the latestAssessment default.

import React, { useState } from 'react';
import type { Plc, PlcGoal } from '@/types';
import { useAuth } from '@/context/useAuth';
import { GoalEditorModal } from '@/components/plc/goals/GoalEditorModal';
import { Section } from '@/components/plc/redesignMockup/ui';
import { logError } from '@/utils/logError';
import { AssessmentHeroView, NoResults } from './DataOverviewSections';
import { GoalView } from './GoalView';
import { TargetHeroView } from './TargetHeroView';
import { findTargetMastery, type DataOverviewModel } from './dataOverviewModel';
import type { TeamHeroProps } from './teamContract';
import { useTeamShellActions } from './teamShellActions';
import {
  useDataOverviewModel,
  useFollowLatest,
  useGoals,
  usePlcNavigation,
} from './useDataOverview';
import type { DataOverviewInput } from './dataOverviewModel';

const useFlag = () => useAuth().canAccessFeature('teams-redesign');

/** Assessment hero from an already-built model (the page shares its own). */
export const AssessmentHeroFromModel: React.FC<{
  plc: Plc;
  model: DataOverviewModel;
  isLead: boolean;
  pinnedBy?: string;
}> = ({ plc, model, isLead, pinnedBy }) => {
  const { openLayoutEditor } = useTeamShellActions();
  const nav = usePlcNavigation(plc.id);
  const followLatest = useFollowLatest(plc);
  if (!model.featured) {
    return (
      <Section first>
        <NoResults />
      </Section>
    );
  }
  const featured = model.featured;
  return (
    <AssessmentHeroView
      featured={featured}
      newer={model.newer}
      isLead={isLead}
      pinnedBy={pinnedBy}
      onChange={openLayoutEditor}
      onOpenResults={() => nav.openAssessment(featured.assessmentId)}
      onShowLatest={() =>
        void followLatest().catch((err: unknown) =>
          logError('plcDataOverview.followLatest', err, { plcId: plc.id })
        )
      }
    />
  );
};

export const AssessmentHero: React.FC<TeamHeroProps> = ({
  plc,
  heroRef,
  pinnedBy,
  isLead,
}) => {
  const { model } = useDataOverviewModel(plc, heroRef);
  if (!useFlag()) return null;
  return (
    <AssessmentHeroFromModel
      plc={plc}
      model={model}
      isLead={isLead}
      pinnedBy={pinnedBy?.name}
    />
  );
};

/** Target hero from shared selector input. */
export const TargetHeroFromInput: React.FC<{
  input: DataOverviewInput;
  model: DataOverviewModel;
  targetId: string;
  isLead: boolean;
  pinnedBy?: string;
}> = ({ input, model, targetId, isLead, pinnedBy }) => {
  const { openLayoutEditor } = useTeamShellActions();
  const titles: Record<string, string> = {};
  for (const a of input.assessments) titles[a.id] = a.title;
  for (const a of input.aggregates) titles[a.assessmentId] ??= a.title ?? '';
  return (
    <TargetHeroView
      row={findTargetMastery(input, targetId)}
      titles={titles}
      shortTitles={model.shortTitles}
      cutoffs={model.cutoffs}
      isLead={isLead}
      pinnedBy={pinnedBy}
      onChange={openLayoutEditor}
    />
  );
};

export const TargetHero: React.FC<TeamHeroProps> = ({
  plc,
  heroRef,
  pinnedBy,
  isLead,
}) => {
  const { input, model } = useDataOverviewModel(plc, null);
  if (!useFlag() || heroRef?.kind !== 'target') return null;
  return (
    <TargetHeroFromInput
      input={input}
      model={model}
      targetId={heroRef.targetId}
      isLead={isLead}
      pinnedBy={pinnedBy?.name}
    />
  );
};

/** Goal card body or hero, with the goal editor for leads. */
export const GoalSection: React.FC<{
  plc: Plc;
  isLead: boolean;
  goalId?: string;
  hero?: boolean;
}> = ({ plc, isLead, goalId, hero = false }) => {
  const { goals, saveGoal, deleteGoal, routines, practicesFor, coach } =
    useGoals(plc);
  const [editing, setEditing] = useState<PlcGoal | 'new' | null>(null);
  const goal =
    (goalId ? goals.find((g) => g.id === goalId) : undefined) ??
    goals[0] ??
    null;
  return (
    <>
      <GoalView
        goal={goal}
        practices={practicesFor(goal)}
        isLead={isLead}
        hero={hero}
        onEdit={setEditing}
        onAdd={() => setEditing('new')}
        coach={isLead ? coach : undefined}
      />
      {editing && (
        <GoalEditorModal
          goal={editing === 'new' ? null : editing}
          showProgress
          nextOrder={goals.length}
          routines={routines}
          onSave={async (draft) => {
            await saveGoal(draft);
          }}
          onDelete={
            editing === 'new' ? undefined : () => deleteGoal(editing.id)
          }
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};

export const GoalHero: React.FC<TeamHeroProps> = ({ plc, heroRef, isLead }) => {
  if (!useFlag()) return null;
  return (
    <Section first>
      <GoalSection
        plc={plc}
        isLead={isLead}
        hero
        {...(heroRef?.kind === 'goal' ? { goalId: heroRef.goalId } : {})}
      />
    </Section>
  );
};
