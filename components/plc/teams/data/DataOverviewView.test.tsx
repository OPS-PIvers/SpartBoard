import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  LearningTargetList,
  PlcAssessmentAggregate,
  PlcGoal,
} from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import {
  AGGREGATES,
  ASSESSMENTS,
  LEARNING_TARGETS,
} from '@/components/plc/redesignMockup/fixtures';
import { AssessmentHeroView } from './DataOverviewSections';
import { DataOverviewView } from './DataOverviewView';
import { GoalView } from './GoalView';
import { ManageTargetsModal } from './ManageTargetsModal';
import { buildDataOverviewModel } from './dataOverviewModel';

const untag = (a: PlcAssessmentAggregate): PlcAssessmentAggregate => {
  const copy = { ...a };
  delete copy.perTarget;
  delete copy.perStandard;
  return copy;
};

function renderView(isLead: boolean, tagged: boolean) {
  const model = buildDataOverviewModel({
    aggregates: tagged ? AGGREGATES : AGGREGATES.map(untag),
    assessments: ASSESSMENTS,
    targets: LEARNING_TARGETS,
    teacherUids: ['t1'],
    heroRef: { kind: 'assessment', assessmentId: 'u3' },
  });
  const onManageTargets = vi.fn();
  render(
    <DataOverviewView
      model={model}
      isLead={isLead}
      cards={BUILT_IN_TEAM_TYPE_PRESETS.plc.cards}
      hero={null}
      goal={null}
      strip={{
        nextMeeting: null,
        openItems: null,
        onOpenNote: vi.fn(),
        onViewItems: vi.fn(),
      }}
      onManageTargets={onManageTargets}
      onOpenAssessment={vi.fn()}
      onAllAssessments={vi.fn()}
    />
  );
  return { onManageTargets };
}

describe('DataOverviewView', () => {
  it('shows the mastery layer when questions are tagged', () => {
    renderView(true, true);
    expect(screen.getByText('Mastery by learning target')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Manage targets/ })).toBeTruthy();
  });

  it('gives an untagged lead a quiet tag prompt', () => {
    const { onManageTargets } = renderView(true, false);
    fireEvent.click(screen.getByRole('button', { name: 'Tag questions' }));
    expect(onManageTargets).toHaveBeenCalled();
  });

  it('never shows members an empty mastery state', () => {
    renderView(false, false);
    expect(screen.queryByText(/Tag questions/)).toBeNull();
    expect(screen.queryByText('Mastery by learning target')).toBeNull();
  });

  it('never compares classes or teachers', () => {
    renderView(true, true);
    expect(screen.queryByText(/class/i)).toBeNull();
  });
});

const GOAL: PlcGoal = {
  id: 'g1',
  title: 'Raise unit CFA scores',
  practices: [],
  order: 0,
  createdBy: 't1',
  createdAt: 1,
  updatedAt: 1,
};

describe('GoalView coach', () => {
  it('sends the goal and shows only suggestions for missed criteria', async () => {
    const coach = vi.fn().mockResolvedValue({
      criteria: [
        { id: 'a', label: 'Time frame', met: false, reason: 'No date.' },
        { id: 'b', label: 'Named measure', met: true, reason: '' },
      ],
      suggestions: [{ criterionId: 'a', suggestedEdit: 'By May 2027,' }],
    });
    render(<GoalView goal={GOAL} practices={[]} isLead coach={coach} />);
    fireEvent.click(screen.getByRole('button', { name: /Check this goal/ }));
    expect(await screen.findByText('By May 2027,')).toBeTruthy();
    expect(coach).toHaveBeenCalledWith({ title: 'Raise unit CFA scores' });
    expect(screen.getByText('No date.')).toBeTruthy();
  });

  it('refuses an empty goal', () => {
    const coach = vi.fn();
    render(
      <GoalView
        goal={{ ...GOAL, title: '  ' }}
        practices={[]}
        isLead
        coach={coach}
      />
    );
    const button = screen.getByRole('button', { name: /Check this goal/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(coach).not.toHaveBeenCalled();
  });

  it('hides the coach from members', () => {
    render(
      <GoalView goal={GOAL} practices={[]} isLead={false} coach={vi.fn()} />
    );
    expect(
      screen.queryByRole('button', { name: /Check this goal/ })
    ).toBeNull();
  });
});

describe('GoalView meter', () => {
  it('draws the meter only when now and goal numbers are set', () => {
    const { rerender } = render(
      <GoalView goal={GOAL} practices={[]} isLead={false} />
    );
    expect(screen.queryByTestId('goal-meter')).toBeNull();
    rerender(
      <GoalView
        goal={{ ...GOAL, baseline: 58, current: 64, target: 80 }}
        practices={[]}
        isLead={false}
      />
    );
    expect(screen.getByTestId('goal-meter')).toBeTruthy();
  });
});

describe('AssessmentHeroView pinned label', () => {
  const featured = () => {
    const model = buildDataOverviewModel({
      aggregates: AGGREGATES,
      assessments: ASSESSMENTS,
      targets: LEARNING_TARGETS,
      teacherUids: ['t1'],
      heroRef: { kind: 'assessment', assessmentId: 'u3' },
    });
    if (!model.featured) throw new Error('no featured assessment');
    return model.featured;
  };

  it('names who pinned it, or just says Pinned', () => {
    const f = featured();
    const { rerender } = render(
      <AssessmentHeroView
        featured={f}
        newer={null}
        isLead={false}
        onOpenResults={vi.fn()}
        pinnedBy="Priya Shah"
      />
    );
    expect(screen.getByText(/Pinned by Priya Shah/)).toBeTruthy();
    rerender(
      <AssessmentHeroView
        featured={f}
        newer={null}
        isLead={false}
        onOpenResults={vi.fn()}
      />
    );
    expect(screen.queryByText(/Pinned by/)).toBeNull();
    expect(screen.getByText(/Pinned/)).toBeTruthy();
  });
});

describe('ManageTargetsModal', () => {
  it('saves cutoffs and archives a removed target on today’s list', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageTargetsModal
        list={{ targets: LEARNING_TARGETS, updatedAt: 1 }}
        questionSets={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove 7.RP.1' }));
    fireEvent.change(screen.getByLabelText(/Proficient at/), {
      target: { value: '85' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as LearningTargetList;
    expect(saved.masteryCutoffs).toEqual({ proficient: 85, approaching: 60 });
    expect(saved.targets.find((t) => t.id === '7.RP.1')?.archived).toBe(true);
  });

  it('refuses cutoffs where approaching exceeds proficient', async () => {
    const onSave = vi.fn();
    render(
      <ManageTargetsModal
        list={{ targets: LEARNING_TARGETS, updatedAt: 1 }}
        questionSets={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/Approaching at/), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
