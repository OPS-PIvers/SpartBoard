import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Plc } from '@/types';
import type { TeamTypeDefaultsState } from '@/hooks/useTeamLayout';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { TeamDashboard } from './TeamDashboard';

const mocks = vi.hoisted(() => ({
  defaults: {
    defaults: { types: {} },
    failed: false,
  } as TeamTypeDefaultsState,
  saveTeamLayout: vi.fn(() => Promise.resolve()),
  spaReplace: vi.fn(),
  spaNavigate: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('@/hooks/useTeamLayout', () => ({
  useTeamTypeDefaultsState: () => mocks.defaults,
  saveTeamLayout: mocks.saveTeamLayout,
}));
vi.mock('@/utils/plcPath', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/plcPath')>()),
  spaReplace: mocks.spaReplace,
  spaNavigate: mocks.spaNavigate,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'lead-1', displayName: 'Lead', email: 'l@x.org' },
    canAccessFeature: () => false,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mocks.addToast }),
}));
vi.mock('@/context/usePlcContext', () => ({
  usePlcActions: () => ({ updateNote: vi.fn() }),
  usePlcActivity: () => [],
  usePlcMeetingsData: () => ({ data: [] }),
  usePlcMembers: () => [],
  usePlcNotesData: () => ({ data: [] }),
  usePlcWhoIsHere: () => [],
}));
vi.mock('@/hooks/useGoogleTasksPull', () => ({ useGoogleTasksPull: vi.fn() }));
vi.mock('@/hooks/usePlcUnread', () => ({
  usePlcUnread: () => ({
    lastSeenAt: null,
    unreadCount: 0,
    markSeen: vi.fn(),
  }),
}));
vi.mock('@/components/plc/search/PlcSearchBox', () => ({
  PlcSearchBox: () => null,
}));
vi.mock('@/components/plc/bodies/MembersBody', () => ({
  MembersBody: () => null,
}));
vi.mock('@/components/plc/bodies/PlcLearningTargetsBody', () => ({
  PlcLearningTargetsBody: () => <div data-testid="targets-body" />,
}));
vi.mock('@/components/plc/tabs/PlcSettingsTab', () => ({
  PlcSettingsTab: () => null,
}));
vi.mock('@/components/plc/meeting/PlcMeetingMode', () => ({
  PlcMeetingMode: () => null,
}));
vi.mock('@/components/plc/meeting/PlcMeetingRecordView', () => ({
  PlcMeetingRecordView: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="meeting-record">{meetingId}</div>
  ),
}));
vi.mock('@/components/plc/teams/notes/useTeamNotes', () => ({
  useTeamMyItems: () => ({
    items: [],
    count: 0,
    loading: false,
    setDone: vi.fn(),
  }),
}));
vi.mock('@/components/plc/teams/pageRegistry', async () => {
  const { FileText } = await import('lucide-react');
  const Page = () => (
    <div data-testid="team-page">
      <input aria-label="Field" />
      <div
        data-testid="editor"
        contentEditable
        suppressContentEditableWarning
      />
    </div>
  );
  const entry = { icon: FileText, Component: Page };
  return {
    TEAM_PAGE_REGISTRY: {
      dataOverview: entry,
      hub: entry,
      programHub: entry,
      assessments: entry,
      docs: entry,
      resources: entry,
      updates: entry,
      workspace: entry,
    },
  };
});
vi.mock('./TeamLayoutEditor', () => ({
  TeamLayoutEditor: () => <div data-testid="layout-editor" />,
}));

const plc = (layout?: Plc['layout']): Plc =>
  ({
    id: 'p1',
    name: 'Grade 7 Math',
    groupType: 'plc',
    leadUid: 'lead-1',
    memberUids: ['lead-1'],
    ...(layout ? { layout } : {}),
  }) as unknown as Plc;

const props = {
  meetingId: null,
  assessmentId: null,
  docId: null,
  onClose: vi.fn(),
};

const openEditor = () => {
  fireEvent.click(screen.getAllByRole('button', { name: 'Team menu' })[0]);
  fireEvent.click(screen.getByRole('menuitem', { name: /Edit layout/ }));
};

beforeEach(() => {
  mocks.defaults = { defaults: { types: {} }, failed: false };
  mocks.saveTeamLayout.mockClear();
  mocks.spaReplace.mockClear();
  mocks.addToast.mockClear();
});

describe('TeamDashboard', () => {
  it('opens Learning Targets at its deep link', () => {
    render(<TeamDashboard plc={plc()} activeSection="targets" {...props} />);
    expect(screen.getByTestId('targets-body')).toBeTruthy();
    expect(mocks.spaReplace).not.toHaveBeenCalled();
  });

  it('lists Learning Targets on the rail after Assessments', () => {
    mocks.spaNavigate.mockClear();
    render(<TeamDashboard plc={plc()} activeSection="home" {...props} />);
    const tabs = screen.getAllByRole('tab');
    const at = tabs.findIndex((tab) =>
      tab.textContent?.includes('Learning Targets')
    );
    expect(tabs[at - 1].textContent).toContain('Assessments');
    fireEvent.click(tabs[at]);
    expect(mocks.spaNavigate).toHaveBeenCalledWith('/plc/p1/targets');
  });

  it('sends targets home on a team without quizzes or videos', () => {
    render(
      <TeamDashboard
        plc={
          {
            ...plc(),
            features: { quizzes: false, videoActivities: false },
          } as Plc
        }
        activeSection="targets"
        {...props}
      />
    );
    expect(mocks.spaReplace).toHaveBeenCalledWith('/plc/p1');
  });

  it('redirects a folded section to its canonical page', () => {
    render(
      <TeamDashboard plc={plc()} activeSection="sharedBoards" {...props} />
    );
    expect(mocks.spaReplace).toHaveBeenCalledWith('/plc/p1/resources');
  });

  it('closes on Escape, but not from a text field or editor', () => {
    const onClose = vi.fn();
    render(
      <TeamDashboard
        plc={plc()}
        activeSection="home"
        {...props}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Field' }), {
      key: 'Escape',
    });
    fireEvent.keyDown(screen.getByTestId('editor'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends retired Meeting Mode links to Notes & Docs', () => {
    render(<TeamDashboard plc={plc()} activeSection="meeting" {...props} />);
    expect(mocks.spaReplace).toHaveBeenCalledWith('/plc/p1/docs');
  });

  it('opens a saved meeting record at its own URL', () => {
    render(
      <TeamDashboard
        plc={plc()}
        activeSection="meeting"
        {...props}
        meetingId="m1"
      />
    );
    expect(screen.getByTestId('meeting-record').textContent).toBe('m1');
    expect(mocks.spaReplace).not.toHaveBeenCalled();
  });

  it('opens the editor without saving, so Cancel leaves the team as it was', () => {
    render(<TeamDashboard plc={plc()} activeSection="home" {...props} />);
    openEditor();
    expect(screen.getByTestId('layout-editor')).toBeTruthy();
    expect(mocks.saveTeamLayout).not.toHaveBeenCalled();
  });

  it('does not open the editor when the defaults read failed', () => {
    mocks.defaults = { defaults: { types: {} }, failed: true };
    render(<TeamDashboard plc={plc()} activeSection="home" {...props} />);
    openEditor();
    expect(mocks.saveTeamLayout).not.toHaveBeenCalled();
    expect(screen.queryByTestId('layout-editor')).toBeNull();
    expect(mocks.addToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('opens a frozen team without saving again', () => {
    mocks.defaults = { defaults: { types: {} }, failed: true };
    const preset = BUILT_IN_TEAM_TYPE_PRESETS.plc;
    render(
      <TeamDashboard
        plc={plc({
          pages: preset.pages,
          landing: preset.landing,
          cards: preset.cards,
          hero: { mode: 'default' },
        })}
        activeSection="home"
        {...props}
      />
    );
    openEditor();
    expect(screen.getByTestId('layout-editor')).toBeTruthy();
    expect(mocks.saveTeamLayout).not.toHaveBeenCalled();
  });
});
