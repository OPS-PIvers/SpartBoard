// Teams redesign screens on fixtures at /teams-redesign-dev (auth-bypass builds only), for review screenshots.

import React, { useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Megaphone,
  Sparkles,
  Users2,
} from 'lucide-react';
import { TeamShell, type ShellOverlay, type ShellPage } from './TeamShell';
import { GearMenu, MembersPopover, TeamDrawer } from './HeaderPanels';
import { MeetingBanner, PlcDataOverviewMock } from './PlcDataOverviewMock';
import { ManageTargetsModal } from './ManageTargetsModal';
import { LayoutEditorModal } from './LayoutEditorModal';
import { DepartmentHubMock } from './DepartmentHubMock';
import { BuildingHubMock, BuildingUpdatesMock } from './BuildingMock';
import {
  MentoringHubMock,
  TaskTrackerMock,
  WorkspaceMock,
} from './MentoringMock';
import { AdminTeamDefaultsMock } from './AdminTeamDefaultsMock';
import { MeetingNoteMock } from './MeetingNoteMock';
import { BLDG_TEAM, DEPT_TEAM, MENT_TEAM, PLC_TEAM } from './fixtures';

export const SCREENS = [
  ['plc', '1. PLC Data overview'],
  ['targets', '1b. Manage targets'],
  ['gear', '2a. Gear menu'],
  ['whatsnew', "2b. What's new drawer"],
  ['myitems', '2c. My items drawer'],
  ['members', '2d. Members popover'],
  ['layout', '3. Layout editor'],
  ['dept', '4. Department Hub'],
  ['bldg', '5a. Building Hub'],
  ['updates', '5b. Building Updates'],
  ['mhub', '6a. Mentoring Program Hub'],
  ['workspace', '6b. Workspace'],
  ['tracker', '6c. Task tracker'],
  ['admin', '7. Admin: Team type defaults'],
  ['note', '8. PLC meeting note'],
] as const;

export type ScreenId = (typeof SCREENS)[number][0];

const PLC_PAGES: ShellPage[] = [
  { id: 'data', label: 'Data overview', icon: BarChart3 },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList },
  { id: 'docs', label: 'Notes & Docs', icon: FileText },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];
const DEPT_PAGES: ShellPage[] = [
  { id: 'hub', label: 'Hub', icon: LayoutDashboard },
  { id: 'docs', label: 'Notes & Docs', icon: FileText },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];
const BLDG_PAGES: ShellPage[] = [
  { id: 'hub', label: 'Hub', icon: LayoutDashboard },
  { id: 'resources', label: 'Resources', icon: Sparkles },
  { id: 'updates', label: 'Updates', icon: Megaphone },
];
const mentPages = (lead: boolean): ShellPage[] => [
  { id: 'hub', label: 'Program Hub', icon: LayoutDashboard },
  { id: 'workspace', label: lead ? 'Workspaces' : 'Workspace', icon: Users2 },
  { id: 'updates', label: 'Updates', icon: Megaphone },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];

const OVERLAY_SCREENS: Partial<Record<ScreenId, ShellOverlay>> = {
  gear: 'gear',
  whatsnew: 'whatsnew',
  myitems: 'myitems',
  members: 'members',
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen');
  return {
    screen: (SCREENS.some(([id]) => id === screen)
      ? screen
      : 'plc') as ScreenId,
    lead: params.get('role') !== 'member',
    tagged: params.get('tagged') !== '0',
    live: params.get('live') === '1',
    capture: params.get('capture') === '1',
  };
}

export const TeamsRedesignDevHarness: React.FC = () => {
  const [initial] = useState(readParams);
  const [screen, setScreenState] = useState<ScreenId>(initial.screen);
  const [lead, setLead] = useState(initial.lead);
  const [tagged, setTagged] = useState(initial.tagged);
  const [live, setLive] = useState(initial.live);
  const overlay = OVERLAY_SCREENS[screen] ?? null;
  const setScreen = (next: ScreenId) => setScreenState(next);
  const setOverlay = (next: ShellOverlay) => setScreen(next ?? 'plc');

  const plcScreens: ScreenId[] = [
    'plc',
    'targets',
    'gear',
    'whatsnew',
    'myitems',
    'members',
    'layout',
  ];

  const renderBody = (): React.ReactNode => {
    if (plcScreens.includes(screen) || screen === 'note') {
      const isNote = screen === 'note';
      return (
        <TeamShell
          team={PLC_TEAM}
          pages={PLC_PAGES}
          activePage={isNote ? 'docs' : 'data'}
          overlay={overlay}
          onOverlay={setOverlay}
          onPage={(id) => setScreen(id === 'docs' ? 'note' : 'plc')}
          isLead={lead}
          fullBleed={isNote}
          banner={
            live ? <MeetingBanner onJoin={() => setScreen('note')} /> : null
          }
          headerPopover={
            screen === 'gear' ? (
              <GearMenu
                isLead={lead}
                onMembers={() => setScreen('members')}
                onLayout={() => setScreen('layout')}
              />
            ) : null
          }
          subHeaderPopover={
            screen === 'members' ? (
              <MembersPopover team={PLC_TEAM} isLead={lead} />
            ) : null
          }
        >
          {isNote ? (
            <MeetingNoteMock onData={() => setScreen('plc')} />
          ) : (
            <PlcDataOverviewMock
              isLead={lead}
              tagged={tagged}
              onLayout={() => setScreen('layout')}
              onTargets={() => setScreen('targets')}
              onNote={() => setScreen('note')}
              onItems={() => setScreen('myitems')}
            />
          )}
          {(screen === 'whatsnew' || screen === 'myitems') && (
            <TeamDrawer
              team={PLC_TEAM}
              tab={screen}
              onTab={setScreen}
              onClose={() => setScreen('plc')}
            />
          )}
          {screen === 'targets' && (
            <ManageTargetsModal
              tagged={tagged}
              onClose={() => setScreen('plc')}
            />
          )}
          {screen === 'layout' && (
            <LayoutEditorModal onClose={() => setScreen('plc')} />
          )}
        </TeamShell>
      );
    }
    if (screen === 'dept') {
      return (
        <TeamShell
          team={DEPT_TEAM}
          pages={DEPT_PAGES}
          activePage="hub"
          overlay={null}
          onOverlay={() => undefined}
          isLead={lead}
        >
          <DepartmentHubMock
            isLead={lead}
            onLayout={() => setScreen('layout')}
          />
        </TeamShell>
      );
    }
    if (screen === 'bldg' || screen === 'updates') {
      return (
        <TeamShell
          team={BLDG_TEAM}
          pages={BLDG_PAGES}
          activePage={screen === 'bldg' ? 'hub' : 'updates'}
          overlay={null}
          onOverlay={() => undefined}
          onPage={(id) => setScreen(id === 'updates' ? 'updates' : 'bldg')}
          isLead={lead}
        >
          {screen === 'bldg' ? (
            <BuildingHubMock
              isLead={lead}
              onLayout={() => setScreen('layout')}
              onUpdates={() => setScreen('updates')}
            />
          ) : (
            <BuildingUpdatesMock key={String(lead)} isLead={lead} />
          )}
        </TeamShell>
      );
    }
    if (screen === 'mhub' || screen === 'workspace' || screen === 'tracker') {
      return (
        <TeamShell
          team={MENT_TEAM}
          pages={mentPages(lead)}
          activePage={screen === 'mhub' ? 'hub' : 'workspace'}
          overlay={null}
          onOverlay={() => undefined}
          onPage={(id) =>
            setScreen(
              id === 'workspace' ? (lead ? 'tracker' : 'workspace') : 'mhub'
            )
          }
          isLead={lead}
        >
          {screen === 'mhub' && (
            <MentoringHubMock
              isLead={lead}
              onLayout={() => setScreen('layout')}
              onTracker={() => setScreen('tracker')}
              onWorkspace={() => setScreen('workspace')}
            />
          )}
          {screen === 'workspace' && (
            <WorkspaceMock isLead={lead} onBack={() => setScreen('tracker')} />
          )}
          {screen === 'tracker' && (
            <TaskTrackerMock onWorkspace={() => setScreen('workspace')} />
          )}
        </TeamShell>
      );
    }
    return <AdminTeamDefaultsMock />;
  };

  return (
    <div
      className={`flex flex-col bg-white font-sans ${initial.capture ? 'min-h-screen' : 'h-screen [height:100dvh] overflow-hidden'}`}
      data-capture={initial.capture || undefined}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700">
        <span className="font-bold uppercase tracking-widest text-slate-500">
          Mockup
        </span>
        <label className="flex items-center gap-2">
          Screen
          <select
            value={screen}
            onChange={(e) => setScreen(e.target.value as ScreenId)}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            {SCREENS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          View as
          <select
            value={lead ? 'lead' : 'member'}
            onChange={(e) => setLead(e.target.value === 'lead')}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="lead">Lead</option>
            <option value="member">Member</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={tagged}
            onChange={(e) => setTagged(e.target.checked)}
          />
          Questions tagged
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          Meeting live
        </label>
      </div>
      <div
        className={initial.capture ? 'flex flex-1 flex-col' : 'min-h-0 flex-1'}
      >
        {renderBody()}
      </div>
    </div>
  );
};
