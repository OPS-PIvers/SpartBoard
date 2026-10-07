import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Plc } from '@/types';
import {
  AGGREGATES,
  ASSESSMENTS,
} from '@/components/plc/redesignMockup/fixtures';
import { resolveTeamLayout } from '@/utils/teamLayout';
import type { LayoutEditorViewProps } from './LayoutEditorView';
import { TeamLayoutEditor } from './TeamLayoutEditor';

const mocks = vi.hoisted(() => ({
  view: null as LayoutEditorViewProps | null,
  usePlcAggregate: vi.fn(),
}));

vi.mock('./LayoutEditorView', () => ({
  LayoutEditorView: (props: LayoutEditorViewProps) => {
    mocks.view = props;
    return null;
  },
}));
vi.mock('@/hooks/usePlcAggregate', () => ({
  usePlcAggregate: mocks.usePlcAggregate,
}));
vi.mock('@/hooks/usePlcAssessments', () => ({
  usePlcAssessments: () => ({ assessments: ASSESSMENTS }),
}));
vi.mock('@/hooks/usePlcDocs', () => ({ usePlcDocs: () => ({ docs: [] }) }));
vi.mock('@/hooks/usePlcGoals', () => ({ usePlcGoals: () => ({ goals: [] }) }));
vi.mock('@/hooks/useLearningTargets', () => ({
  usePlcLearningTargets: () => ({ list: null }),
}));
vi.mock('@/context/usePlcContext', () => ({
  usePlcNotesData: () => ({ data: [] }),
}));
vi.mock('@/hooks/useTeamLayout', () => ({ saveTeamLayout: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'lead', displayName: 'Lead', email: null },
  }),
}));

describe('TeamLayoutEditor', () => {
  it('reads aggregates for the "Follow latest" hint from the team, not the landing slice', () => {
    mocks.usePlcAggregate.mockReturnValue({ aggregates: AGGREGATES });
    const plc = { id: 'p1', name: 'Math', groupType: 'plc' } as unknown as Plc;
    render(
      <TeamLayoutEditor
        plc={plc}
        layout={resolveTeamLayout(plc, null)}
        adminDefaults={null}
        isLead
        onClose={vi.fn()}
      />
    );
    expect(mocks.usePlcAggregate).toHaveBeenCalledWith('p1');
    expect(
      mocks.view?.newerFor?.({ kind: 'assessment', assessmentId: 'u3' })
        ?.assessmentId
    ).toBe('u4');
  });
});
