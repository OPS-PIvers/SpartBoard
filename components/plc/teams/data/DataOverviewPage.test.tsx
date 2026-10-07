import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Plc, TeamHero } from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import DataOverviewPage from './DataOverviewPage';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => true }),
}));
vi.mock('@/hooks/usePlcAggregate', () => ({ usePlcAggregate: vi.fn() }));
vi.mock('@/hooks/usePlcAssessments', () => ({ usePlcAssessments: vi.fn() }));
vi.mock('@/hooks/useLearningTargets', () => ({
  usePlcLearningTargets: vi.fn(),
}));
vi.mock('./ManageTargetsModal', () => ({ ManageTargetsModal: () => null }));
const mockModel = vi.hoisted(() => ({ featured: {} as object | null }));
vi.mock('./useDataOverview', () => ({
  useDataOverviewModel: () => ({ model: mockModel, input: {} }),
  useMeetingStrip: () => ({ nextMeeting: null, openItems: null }),
  usePlcNavigation: () => ({}),
}));
vi.mock('./teamShellActions', () => ({ useTeamShellActions: () => ({}) }));
vi.mock('./heroes', () => ({
  AssessmentHeroFromModel: ({ pinnedBy }: { pinnedBy?: string }) => (
    <div data-testid="assessment-hero">{pinnedBy}</div>
  ),
  GoalSection: ({ hero }: { hero?: boolean }) =>
    hero ? <div data-testid="goal-hero" /> : null,
  TargetHeroFromInput: () => <div data-testid="target-hero" />,
}));
vi.mock('./DataOverviewView', () => ({
  DataOverviewView: ({ hero }: { hero: React.ReactNode }) => <div>{hero}</div>,
}));
vi.mock('@/components/plc/teams/heroes/TeamHeroRegion', () => ({
  TeamHeroRegion: () => <div data-testid="shared-hero" />,
}));

const plc = { id: 'p1', name: 'Math', groupType: 'plc' } as unknown as Plc;
const layoutWith = (hero: TeamHero): ResolvedTeamLayout => ({
  pages: BUILT_IN_TEAM_TYPE_PRESETS.plc.pages,
  landing: 'dataOverview',
  cards: BUILT_IN_TEAM_TYPE_PRESETS.plc.cards,
  hero,
  heroRule: 'latestAssessment',
  source: 'team',
});
const pinnedBy = { uid: 'u1', name: 'Priya Shah' };

describe('DataOverviewPage hero', () => {
  it.each([
    { kind: 'doc', docId: 'd1' },
    { kind: 'note', noteId: 'n1' },
    { kind: 'update', updateId: 'x1' },
    { kind: 'calendar' },
  ] as const)('sends a pinned $kind through the shared hero', (ref) => {
    render(
      <DataOverviewPage
        plc={plc}
        layout={layoutWith({ mode: 'pinned', ref, pinnedBy })}
        isLead
      />
    );
    expect(screen.getByTestId('shared-hero')).toBeTruthy();
    expect(screen.queryByTestId('assessment-hero')).toBeNull();
  });

  it('keeps assessment, target and goal pins on its own heroes', () => {
    const { unmount } = render(
      <DataOverviewPage
        plc={plc}
        layout={layoutWith({
          mode: 'pinned',
          ref: { kind: 'assessment', assessmentId: 'a1' },
          pinnedBy,
        })}
        isLead
      />
    );
    expect(screen.getByTestId('assessment-hero').textContent).toBe(
      'Priya Shah'
    );
    unmount();
    render(
      <DataOverviewPage
        plc={plc}
        layout={layoutWith({
          mode: 'pinned',
          ref: { kind: 'goal', goalId: 'g1' },
        })}
        isLead
      />
    );
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.queryByTestId('shared-hero')).toBeNull();
  });

  it('draws no hero when no assessment has results yet', () => {
    mockModel.featured = null;
    const { container } = render(
      <DataOverviewPage
        plc={plc}
        layout={layoutWith({ mode: 'default' })}
        isLead
      />
    );
    expect(screen.queryByTestId('assessment-hero')).toBeNull();
    expect(container.textContent).toBe('');
    mockModel.featured = {};
  });
});
