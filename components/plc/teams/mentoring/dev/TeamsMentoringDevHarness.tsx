// Mentoring screens built from the production views on fixtures, at /teams-mentoring-dev (auth-bypass builds only).

import React, { useState } from 'react';
import { LayoutDashboard, Megaphone, Sparkles, Users2 } from 'lucide-react';
import {
  TeamShell,
  type ShellPage,
} from '@/components/plc/redesignMockup/TeamShell';
import { CalendarEmbed } from '@/components/plc/redesignMockup/BuildingMock';
import { MENT_TEAM } from '@/components/plc/redesignMockup/fixtures';
import {
  META,
  Row,
  RowList,
  SectionHead,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import {
  nextRequiredTask,
  pairNames,
  pairTaskStatus,
  summarizeTask,
} from '@/utils/mentoring';
import { NextTaskHeroView } from '../NextTaskHeroView';
import {
  ResourcesListView,
  SubmissionStatusView,
  YourTasksView,
} from '../ProgramHubCards';
import { ProgramHubView } from '../ProgramHubView';
import {
  FacilitatorWorkspacesScreen,
  PairWorkspacesScreen,
  WorkspaceScreen,
  type RenderWorkspace,
} from '../WorkspacePage';
import {
  CHECK_INS,
  MENT_PLC,
  RESOURCES,
  programData,
  trackerData,
} from './mentoringFixtures';

type Screen = 'mhub' | 'workspace' | 'tracker';

const pages = (lead: boolean): ShellPage[] => [
  { id: 'hub', label: 'Program Hub', icon: LayoutDashboard },
  { id: 'workspace', label: lead ? 'Workspaces' : 'Workspace', icon: Users2 },
  { id: 'updates', label: 'Updates', icon: Megaphone },
  { id: 'resources', label: 'Resources', icon: Sparkles },
];

/** Stand-in for slice B4's latestUpdates card. */
const UpdatesFixture: React.FC = () => (
  <>
    <SectionHead title="Latest updates">
      <TextLink>All updates</TextLink>
    </SectionHead>
    <RowList>
      {[
        ['Observation window opens Oct 13', 'Laura Benson', 'Oct 6'],
        ['Release-time sub codes for October', 'Tom Reyes', 'Oct 1'],
        ['Kickoff slides and recording', 'Laura Benson', 'Sep 12'],
      ].map(([t, who, d]) => (
        <Row
          key={t}
          icon={Megaphone}
          title={t}
          meta={who}
          trailing={<span className={META}>{d}</span>}
        />
      ))}
    </RowList>
  </>
);

/** Stand-in for slice B4's calendar card. */
const CalendarFixture: React.FC = () => (
  <>
    <SectionHead title="Program dates" />
    <CalendarEmbed
      name="Mentoring program"
      events={[
        ['Mon Oct 13', 'Observation window opens'],
        ['Fri Oct 24', 'Observation reflection due'],
        ['Wed Nov 5', 'Cohort session 2, 4:00 PM'],
        ['Fri Jan 16', 'Mid-year check-in due'],
      ]}
    />
  </>
);

const Hub: React.FC<{ lead: boolean; onWorkspace: () => void }> = ({
  lead,
  onWorkspace,
}) => {
  const data = programData(lead);
  const own = lead ? null : data.mine[0];
  const task = nextRequiredTask(data.tasks, data.now, own);
  const names = own ? pairNames(MENT_PLC, own) : null;
  const all = trackerData();
  return (
    <ProgramHubView
      hero={
        <NextTaskHeroView
          task={task}
          isLead={lead}
          pair={
            own && task && names
              ? {
                  status: pairTaskStatus(task, own, data.now),
                  partnerName:
                    data.uid === own.mentorUid ? names.mentee : names.mentor,
                }
              : null
          }
          onEditLayout={() => undefined}
          onOpenTracker={onWorkspace}
          onOpenWorkspace={onWorkspace}
        />
      }
      main={[
        lead ? (
          <SubmissionStatusView
            key="status"
            total={all.workspaces.length}
            summaries={all.tasks.map((t) =>
              summarizeTask(t, all.workspaces, all.now)
            )}
          />
        ) : (
          <YourTasksView
            key="tasks"
            rows={data.tasks.map((t) => ({
              task: t,
              status: pairTaskStatus(
                t,
                own ?? { taskStatus: {}, mentorUid: '', menteeUid: '' },
                data.now
              ),
            }))}
          />
        ),
        <UpdatesFixture key="updates" />,
      ]}
      side={[
        <CalendarFixture key="cal" />,
        <ResourcesListView key="res" links={RESOURCES} />,
      ]}
    />
  );
};

function readParams(): { screen: Screen; lead: boolean } {
  const params = new URLSearchParams(window.location.search);
  const s = params.get('screen');
  return {
    screen: s === 'workspace' || s === 'tracker' ? s : 'mhub',
    lead: params.get('role') !== 'member',
  };
}

export const TeamsMentoringDevHarness: React.FC = () => {
  const [initial] = useState(readParams);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const lead = initial.lead;
  const data = screen === 'tracker' ? trackerData() : programData(lead);
  const renderWorkspace: RenderWorkspace = (ws, onBack) => (
    <WorkspaceScreen
      plc={MENT_PLC}
      ws={ws}
      data={data}
      isLead={lead}
      onBack={onBack}
      checkIns={CHECK_INS}
      template=""
      user={{ uid: data.uid ?? '', displayName: null }}
    />
  );
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white font-sans [height:100dvh]">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700">
        <span className="font-bold uppercase tracking-widest text-slate-500">
          Build
        </span>
        <label className="flex items-center gap-2">
          Screen
          <select
            value={screen}
            onChange={(e) => setScreen(e.target.value as Screen)}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="mhub">6a. Mentoring Program Hub</option>
            <option value="workspace">6b. Workspace</option>
            <option value="tracker">6c. Task tracker</option>
          </select>
        </label>
        <span>{lead ? 'Lead' : 'Member'}</span>
      </div>
      <div className="min-h-0 flex-1">
        <TeamShell
          team={MENT_TEAM}
          pages={pages(lead)}
          activePage={screen === 'mhub' ? 'hub' : 'workspace'}
          overlay={null}
          onOverlay={() => undefined}
          onPage={(id) => setScreen(id === 'workspace' ? 'tracker' : 'mhub')}
          isLead={lead}
        >
          {screen === 'mhub' && (
            <Hub lead={lead} onWorkspace={() => setScreen('tracker')} />
          )}
          {screen !== 'mhub' &&
            (lead ? (
              <FacilitatorWorkspacesScreen
                key={screen}
                plc={MENT_PLC}
                data={data}
                renderWorkspace={renderWorkspace}
                initialOpenId={
                  screen === 'workspace'
                    ? (data.workspaces[0]?.id ?? null)
                    : null
                }
              />
            ) : (
              <PairWorkspacesScreen
                plc={MENT_PLC}
                data={data}
                renderWorkspace={renderWorkspace}
              />
            ))}
        </TeamShell>
      </div>
    </div>
  );
};
