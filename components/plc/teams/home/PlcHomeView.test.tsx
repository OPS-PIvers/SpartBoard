import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TeamCardId } from '@/types';
import {
  AGGREGATES,
  ASSESSMENTS,
  LEARNING_TARGETS,
} from '@/components/plc/redesignMockup/fixtures';
import { buildDataOverviewModel } from '@/components/plc/teams/data/dataOverviewModel';
import { PlcHomeView } from './PlcHomeView';
import { plcHomeBlocks, plcHomeRows } from './homeBlocks';

const model = buildDataOverviewModel({
  aggregates: AGGREGATES,
  assessments: ASSESSMENTS,
  targets: LEARNING_TARGETS,
  teacherUids: ['t1'],
  heroRef: null,
});

function renderHome(
  cards: readonly TeamCardId[],
  props: Partial<React.ComponentProps<typeof PlcHomeView>> = {}
) {
  return render(
    <PlcHomeView
      model={model}
      cards={cards}
      tools={[]}
      strip={{
        nextMeeting: 'Thu, Oct 9 · 3:15 PM',
        openItems: { total: 5, mine: 2 },
        onOpenNote: vi.fn(),
        onViewItems: vi.fn(),
      }}
      goal={<div data-testid="goal" />}
      updates={<div data-testid="updates" />}
      calendar={<div data-testid="calendar" />}
      onOpenDataOverview={vi.fn()}
      onOpenAssessment={vi.fn()}
      onAllAssessments={vi.fn()}
      {...props}
    />
  );
}

const blocksOf = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-home-block]')].map((el) =>
    el.getAttribute('data-home-block')
  );

describe('PlcHomeView', () => {
  it('hides the data cards a lead switched off', () => {
    const { container } = renderHome([
      'hero',
      'goals',
      'nextMeeting',
      'openItems',
      'latestUpdates',
      'calendar',
    ]);
    expect(blocksOf(container)).toEqual([
      'goals',
      'strip',
      'updates',
      'calendar',
    ]);
    expect(screen.queryByText('Score distribution')).toBeNull();
    expect(screen.queryByText('Team average over time')).toBeNull();
    expect(screen.queryByText('Recent assessments')).toBeNull();
    expect(screen.queryByText('Latest assessment')).toBeNull();
  });

  it('follows the layout order', () => {
    const { container } = renderHome([
      'recentAssessments',
      'trend',
      'goals',
      'distribution',
    ]);
    expect(blocksOf(container)).toEqual([
      'assessments',
      'trend',
      'goals',
      'distribution',
    ]);
  });

  it('shows only the meeting entries whose cards are on', () => {
    renderHome(['openItems']);
    expect(screen.queryByText(/Oct 9/)).toBeNull();
    expect(screen.getByText(/5 open items|open item/i)).toBeTruthy();
  });

  it('leaves out All assessments when the Assessments page is off', () => {
    renderHome(['recentAssessments'], { onAllAssessments: undefined });
    expect(screen.getByText('Recent assessments')).toBeTruthy();
    expect(screen.queryByText('All assessments')).toBeNull();
  });

  it('skips cards with nothing to show', () => {
    const { container } = renderHome(['latestUpdates', 'calendar', 'goals'], {
      updates: null,
      calendar: null,
    });
    expect(blocksOf(container)).toEqual(['goals']);
  });
});

describe('plcHomeBlocks and plcHomeRows', () => {
  it('folds next meeting and open items into one strip', () => {
    expect(
      plcHomeBlocks(
        ['nextMeeting', 'hero', 'openItems', 'quickLinks'],
        () => true
      )
    ).toEqual(['strip']);
  });

  it('packs a short row into even columns and a full row by span', () => {
    expect(plcHomeRows(['distribution', 'trend', 'goals'])).toEqual([
      { blocks: ['distribution', 'trend'], full: false },
      { blocks: ['goals'], full: true },
    ]);
    expect(plcHomeRows(['updates', 'calendar'])).toEqual([
      { blocks: ['updates', 'calendar'], full: true },
    ]);
  });
});
