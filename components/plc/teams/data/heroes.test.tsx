import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Plc } from '@/types';
import type { DataOverviewModel } from './dataOverviewModel';
import { AssessmentHeroFromModel } from './heroes';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => true }),
}));
vi.mock('@/components/plc/goals/GoalEditorModal', () => ({
  GoalEditorModal: () => null,
}));
vi.mock('./useDataOverview', () => ({
  useDataOverviewModel: vi.fn(),
  useFollowLatest: () => vi.fn(),
  useGoals: vi.fn(),
  usePlcNavigation: () => ({}),
}));

describe('AssessmentHeroFromModel', () => {
  it('draws nothing when no assessment has results yet', () => {
    const { container } = render(
      <AssessmentHeroFromModel
        plc={{ id: 'p1' } as Plc}
        model={{ featured: null } as unknown as DataOverviewModel}
        isLead={false}
      />
    );
    expect(container.textContent).toBe('');
  });
});
