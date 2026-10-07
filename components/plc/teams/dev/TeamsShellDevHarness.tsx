// Team shell views on the mockup's fixtures at /teams-shell-dev (auth-bypass builds only), for side-by-side screenshots.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Plc,
  PlcGroupType,
  PlcTeamLayout,
  TeamHeroRef,
  TeamPageId,
} from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { PlcSettingsTab } from '@/components/plc/tabs/PlcSettingsTab';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { splitSinceYouWereHere } from '@/components/plc/activity/activityDescriptions';
import { PlcDataOverviewMock } from '@/components/plc/redesignMockup/PlcDataOverviewMock';
import {
  ACTIVITY,
  AGGREGATES,
  ASSESSMENTS,
  LAST_SEEN,
  LEARNING_TARGETS,
  PLC_TEAM,
} from '@/components/plc/redesignMockup/fixtures';
import { TEAM_PAGE_REGISTRY } from '@/components/plc/teams/pageRegistry';
import {
  teamPageLabel,
  teamTypeLabel,
} from '@/components/plc/teams/teamLabels';
import { selectNewerHeroData } from '@/components/plc/teams/heroes/heroStaleness';
import {
  TeamShellView,
  type TeamOverlay,
} from '@/components/plc/teams/shell/TeamShellView';
import {
  GearMenuView,
  MeetingBannerView,
  MembersPopoverView,
  TeamDrawerView,
  type TeamMemberRow,
  type TeamMyItemRow,
} from '@/components/plc/teams/shell/TeamHeaderPanels';
import {
  LayoutEditorView,
  type HeroPinGroup,
} from '@/components/plc/teams/shell/LayoutEditorView';
import { selectAvatarPeople } from '@/components/plc/teams/shell/teamShellData';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';

const SCREENS = [
  'plc',
  'gear',
  'whatsnew',
  'myitems',
  'members',
  'layout',
  'settings',
] as const;
type Screen = (typeof SCREENS)[number];

const LAYOUT: ResolvedTeamLayout = {
  pages: BUILT_IN_TEAM_TYPE_PRESETS.plc.pages,
  landing: 'dataOverview',
  heroRule: 'latestAssessment',
  cards: [
    'hero',
    'distribution',
    'trend',
    'participation',
    'masteryByTarget',
    'goals',
    'recentAssessments',
    'nextMeeting',
    'openItems',
  ],
  hero: { mode: 'pinned', ref: { kind: 'assessment', assessmentId: 'u3' } },
  source: 'team',
};

const DISTRICT_DEFAULT: PlcTeamLayout = {
  pages: BUILT_IN_TEAM_TYPE_PRESETS.plc.pages,
  landing: BUILT_IN_TEAM_TYPE_PRESETS.plc.landing,
  cards: BUILT_IN_TEAM_TYPE_PRESETS.plc.cards,
  hero: { mode: 'default' },
};

const MY_ITEMS: TeamMyItemRow[] = [
  {
    id: 'i1',
    title: 'Build a 3-question exit ticket for Q5',
    from: 'PLC meeting Oct 2',
    when: 'Due Oct 13',
    done: false,
  },
  {
    id: 'i2',
    title: 'Tag Unit 4 Quick Check questions',
    from: 'PLC meeting Oct 2',
    when: 'Due Oct 10',
    done: false,
  },
  {
    id: 'i3',
    title: 'Share the Unit 3 answer key',
    from: 'PLC meeting Sep 25',
    when: 'Done Sep 29',
    done: true,
  },
];

const PIN_GROUPS: HeroPinGroup[] = [
  {
    label: 'Assessment results',
    options: [...ASSESSMENTS].reverse().map((a) => ({
      ref: { kind: 'assessment', assessmentId: a.id },
      label: a.title,
    })),
  },
  {
    label: 'Learning target trend',
    options: LEARNING_TARGETS.map((target) => ({
      ref: { kind: 'target', targetId: target.id },
      label: `${target.code} ${target.label}`,
    })),
  },
  {
    label: 'Goals',
    options: [
      {
        ref: { kind: 'goal', goalId: 'g1' },
        label: '80% at 75% or higher by May',
      },
    ],
  },
  {
    label: 'Notes & Docs',
    options: [
      { ref: { kind: 'doc', docId: 'd1' }, label: 'Unit 3 reteach plan' },
      { ref: { kind: 'note', noteId: 'n1' }, label: 'PLC meeting Oct 9' },
    ],
  },
];

const HARNESS_AUTH = {
  user: { uid: 'me' },
  canAccessFeature: () => true,
} as unknown as AuthContextType;
const HARNESS_DASHBOARD = {
  addToast: () => undefined,
} as unknown as DashboardContextValue;

const SETTINGS_TEAM_NAMES: Record<PlcGroupType, string> = {
  plc: PLC_TEAM.name,
  department: 'Math Department',
  building: 'Orono Middle School',
  mentoring: 'New Teacher Mentoring',
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen');
  return {
    screen: (SCREENS as readonly string[]).includes(screen ?? '')
      ? (screen as Screen)
      : 'plc',
    lead: params.get('role') !== 'member',
    live: params.get('live') === '1',
    capture: params.get('capture') === '1',
    type: (params.get('type') ?? 'plc') as PlcGroupType,
  };
}

export const TeamsShellDevHarness: React.FC = () => {
  const { t } = useTranslation();
  const [initial] = useState(readParams);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const lead = initial.lead;
  const overlay: TeamOverlay =
    screen === 'gear' ||
    screen === 'whatsnew' ||
    screen === 'myitems' ||
    screen === 'members'
      ? screen
      : null;

  const members: TeamMemberRow[] = PLC_TEAM.members.map((m) => ({
    id: m.name,
    name: m.name,
    roleLabel: m.role,
    online: m.online,
  }));
  const { since, older } = splitSinceYouWereHere(ACTIVITY, LAST_SEEN);
  const settingsType = initial.type;
  const settingsPlc = {
    ...PLC_TEAM,
    id: 'harness',
    name: SETTINGS_TEAM_NAMES[settingsType],
    groupType: settingsType,
    leadUid: 'me',
    memberUids: ['me'],
  } as unknown as Plc;
  const pagesSource =
    screen === 'settings'
      ? BUILT_IN_TEAM_TYPE_PRESETS[settingsType].pages
      : LAYOUT.pages;
  const pages = pagesSource
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      label: teamPageLabel(t, p.id, lead),
      icon: TEAM_PAGE_REGISTRY[p.id].icon,
    }));
  const newerFor = useMemo(
    () => (ref: TeamHeroRef) =>
      selectNewerHeroData(ref, AGGREGATES, ASSESSMENTS),
    []
  );

  return (
    <div
      className={`flex flex-col bg-white font-sans ${initial.capture ? 'min-h-screen' : 'h-screen [height:100dvh] overflow-hidden'}`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700">
        <span className="font-bold uppercase tracking-widest text-slate-500">
          Build
        </span>
        <select
          aria-label="Screen"
          value={screen}
          onChange={(e) => setScreen(e.target.value as Screen)}
          className="rounded border border-slate-300 bg-white px-2 py-1"
        >
          {SCREENS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
      <div
        className={initial.capture ? 'flex flex-1 flex-col' : 'min-h-0 flex-1'}
      >
        <TeamShellView
          name={
            screen === 'settings'
              ? SETTINGS_TEAM_NAMES[settingsType]
              : PLC_TEAM.name
          }
          typeLabel={
            screen === 'settings'
              ? teamTypeLabel(t, settingsType)
              : PLC_TEAM.typeLabel
          }
          whatsNew={PLC_TEAM.whatsNew}
          myItems={PLC_TEAM.myItems}
          people={selectAvatarPeople(t, members)}
          memberCount={PLC_TEAM.memberCount}
          roleLabel={lead ? 'Lead' : null}
          pages={pages}
          activePage={
            screen === 'settings' ? null : ('dataOverview' satisfies TeamPageId)
          }
          overlay={overlay}
          onOverlay={(next) =>
            setScreen(next && next !== 'search' ? next : 'plc')
          }
          onPage={() => setScreen('plc')}
          onClose={() => undefined}
          panelId="dataOverview"
          banner={
            initial.live ? (
              <MeetingBannerView
                meta="PLC meeting Oct 9 · started 3:16 PM · 3 here"
                onJoin={() => undefined}
              />
            ) : null
          }
          headerPopover={
            screen === 'gear' ? (
              <GearMenuView
                isLead={lead}
                onMembers={() => setScreen('members')}
                onSettings={() => undefined}
                onLayout={() => setScreen('layout')}
              />
            ) : null
          }
          subHeaderPopover={
            screen === 'members' ? (
              <MembersPopoverView
                members={members}
                memberCount={PLC_TEAM.memberCount}
                isLead={lead}
                onManage={() => undefined}
              />
            ) : null
          }
        >
          {screen === 'settings' ? (
            <AuthContext.Provider value={HARNESS_AUTH}>
              <DashboardContext.Provider value={HARNESS_DASHBOARD}>
                <div className="p-4 pb-8 md:p-6">
                  <PlcSettingsTab plc={settingsPlc} />
                </div>
              </DashboardContext.Provider>
            </AuthContext.Provider>
          ) : (
            <PlcDataOverviewMock
              isLead={lead}
              tagged
              onLayout={() => setScreen('layout')}
              onTargets={() => undefined}
              onNote={() => undefined}
              onItems={() => setScreen('myitems')}
            />
          )}
          {(screen === 'whatsnew' || screen === 'myitems') && (
            <TeamDrawerView
              tab={screen}
              onTab={setScreen}
              onClose={() => setScreen('plc')}
              whatsNew={PLC_TEAM.whatsNew}
              myItemsCount={PLC_TEAM.myItems}
              sinceLabel="Since you were here Oct 2"
              since={since}
              older={older}
              selfUid="me"
              onMarkAllSeen={() => undefined}
              items={MY_ITEMS}
            />
          )}
          {screen === 'layout' && (
            <LayoutEditorView
              groupType="plc"
              layout={LAYOUT}
              heroRule="latestAssessment"
              districtDefault={DISTRICT_DEFAULT}
              pinGroups={PIN_GROUPS}
              newerFor={newerFor}
              isLead={lead}
              onSave={() => setScreen('plc')}
              onClose={() => setScreen('plc')}
            />
          )}
        </TeamShellView>
      </div>
    </div>
  );
};
