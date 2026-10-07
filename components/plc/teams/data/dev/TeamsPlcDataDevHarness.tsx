// The production Data overview views on mockup fixtures at /teams-plc-data-dev (auth-bypass dev builds only).

import React, { useMemo, useState } from 'react';
import { BarChart3, ClipboardList, FileText, Sparkles } from 'lucide-react';
import type { PlcAssessmentAggregate, PlcGoal, TeamHeroRef } from '@/types';
import type { GoalCoachResult } from '@/config/goalCoachRubric';
import {
  TeamShell,
  type ShellPage,
} from '@/components/plc/redesignMockup/TeamShell';
import {
  AGGREGATES,
  ASSESSMENTS,
  LEARNING_TARGETS,
  MOCK_NOW,
  PLC_TEAM,
  SHORT_TITLES,
} from '@/components/plc/redesignMockup/fixtures';
import { DataOverviewView } from '../DataOverviewView';
import { AssessmentHeroView, NoResults } from '../DataOverviewSections';
import { GoalView } from '../GoalView';
import { TargetHeroView } from '../TargetHeroView';
import { ManageTargetsModal } from '../ManageTargetsModal';
import {
  buildDataOverviewModel,
  buildTagQuestionSets,
  findTargetMastery,
} from '../dataOverviewModel';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';

const PAGES: ShellPage[] = [
  { id: 'data', label: 'Data overview', icon: BarChart3 },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList },
  { id: 'docs', label: 'Notes & Docs', icon: FileText },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];

const TEACHERS = ['t1', 't2', 't3', 't4', 't5'];

const GOAL: PlcGoal = {
  id: 'g1',
  title:
    'By May 2027, 80% of students score 75% or higher on unit CFAs, up from 58% on Unit 1, through weekly small-group reteach.',
  measure: 'Students at 75% or higher',
  baseline: 58,
  current: 64,
  target: 80,
  practices: [{ id: 'p1', text: 'Weekly small-group reteach' }],
  order: 0,
  createdBy: 't1',
  createdAt: MOCK_NOW,
  updatedAt: MOCK_NOW,
};

const COACH_RESULT: GoalCoachResult = {
  criteria: [
    { id: 'student-focused', label: 'Student-focused', met: true, reason: '' },
    { id: 'named-measure', label: 'Named measure', met: true, reason: '' },
    {
      id: 'baseline-target',
      label: 'Baseline and target',
      met: true,
      reason: '',
    },
    { id: 'time-frame', label: 'Time frame', met: true, reason: '' },
    {
      id: 'practice-change',
      label: 'Practice change',
      met: false,
      reason: 'Small-group reteach is named but not how often or for whom.',
    },
  ],
  suggestions: [
    {
      criterionId: 'practice-change',
      suggestedEdit:
        'through a weekly 20-minute small-group reteach for students under 75% on each CFA.',
    },
  ],
};

const untag = (a: PlcAssessmentAggregate): PlcAssessmentAggregate => {
  const copy = { ...a };
  delete copy.perTarget;
  delete copy.perStandard;
  return copy;
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const hero = params.get('hero');
  return {
    screen: params.get('screen') === 'targets' ? 'targets' : 'plc',
    lead: params.get('role') !== 'member',
    tagged: params.get('tagged') !== '0',
    hero:
      hero === 'target' || hero === 'goal' || hero === 'latest'
        ? hero
        : 'assessment',
    coach: params.get('coach') === '1',
    capture: params.get('capture') === '1',
  };
}

export const TeamsPlcDataDevHarness: React.FC = () => {
  const [initial] = useState(readParams);
  const [screen, setScreen] = useState(initial.screen);
  const { lead, tagged, hero: heroKind } = initial;
  const aggregates = useMemo(
    () => (tagged ? AGGREGATES : AGGREGATES.map(untag)),
    [tagged]
  );
  const heroRef: TeamHeroRef | null =
    heroKind === 'assessment'
      ? { kind: 'assessment', assessmentId: 'u3' }
      : heroKind === 'target'
        ? { kind: 'target', targetId: '7.RP.1' }
        : heroKind === 'goal'
          ? { kind: 'goal', goalId: 'g1' }
          : null;
  const input = {
    aggregates,
    assessments: ASSESSMENTS,
    targets: LEARNING_TARGETS,
    teacherUids: TEACHERS,
    heroRef,
    shortTitles: SHORT_TITLES,
  };
  const model = buildDataOverviewModel(input);
  const titles = Object.fromEntries(ASSESSMENTS.map((a) => [a.id, a.title]));
  const goal = (heroAsHero: boolean) => (
    <GoalView
      goal={GOAL}
      practices={['Weekly small-group reteach']}
      isLead={lead}
      hero={heroAsHero}
      pinned={heroAsHero}
      pinnedBy="Priya Shah"
      onEdit={() => undefined}
      onAdd={() => undefined}
      coach={() => Promise.resolve(COACH_RESULT)}
      initialResult={initial.coach ? COACH_RESULT : null}
    />
  );

  const heroNode =
    heroKind === 'target' ? (
      <TargetHeroView
        row={findTargetMastery(input, '7.RP.1')}
        titles={titles}
        shortTitles={SHORT_TITLES}
        cutoffs={model.cutoffs}
        isLead={lead}
        pinnedBy="Priya Shah"
        onChange={() => undefined}
      />
    ) : heroKind === 'goal' ? (
      <section className="pb-6 pt-6">{goal(true)}</section>
    ) : model.featured ? (
      <AssessmentHeroView
        featured={model.featured}
        newer={model.newer}
        isLead={lead}
        pinnedBy="Priya Shah"
        onChange={() => undefined}
        onOpenResults={() => undefined}
        onShowLatest={() => undefined}
      />
    ) : (
      <NoResults />
    );

  return (
    <div
      className={`flex flex-col bg-white font-sans ${initial.capture ? 'min-h-screen' : 'h-screen [height:100dvh] overflow-hidden'}`}
    >
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700">
        <span className="font-bold uppercase tracking-widest text-slate-500">
          Build
        </span>
        <span className="py-1">
          screen={screen} · role={lead ? 'lead' : 'member'} · tagged=
          {tagged ? '1' : '0'} · hero={heroKind}
        </span>
      </div>
      <div
        className={initial.capture ? 'flex flex-1 flex-col' : 'min-h-0 flex-1'}
      >
        <TeamShell
          team={PLC_TEAM}
          pages={PAGES}
          activePage="data"
          overlay={null}
          onOverlay={() => undefined}
          isLead={lead}
        >
          <DataOverviewView
            model={model}
            isLead={lead}
            cards={BUILT_IN_TEAM_TYPE_PRESETS.plc.cards}
            hero={heroNode}
            goal={goal(false)}
            strip={{
              nextMeeting: 'Thu, Oct 9 · 3:15 PM',
              openItems: { total: 5, mine: 2 },
              onOpenNote: () => undefined,
              onViewItems: () => undefined,
            }}
            onManageTargets={() => setScreen('targets')}
            onOpenAssessment={() => undefined}
            onAllAssessments={() => undefined}
          />
          {screen === 'targets' && (
            <ManageTargetsModal
              list={{ targets: LEARNING_TARGETS, updatedAt: MOCK_NOW }}
              questionSets={buildTagQuestionSets(aggregates, ASSESSMENTS)}
              onSave={() => Promise.resolve()}
              onClose={() => setScreen('plc')}
            />
          )}
        </TeamShell>
      </div>
    </div>
  );
};
