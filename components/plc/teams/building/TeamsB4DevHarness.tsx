// Production Building Hub and Updates views on fixtures at /teams-b4-dev (auth-bypass dev builds only), for side-by-side checks.

import React, { useState } from 'react';
import { LayoutDashboard, Megaphone, Sparkles } from 'lucide-react';
import {
  TeamShell,
  type ShellPage,
} from '@/components/plc/redesignMockup/TeamShell';
import { CalendarEmbed } from '@/components/plc/redesignMockup/BuildingMock';
import { BLDG_TEAM, STAFF } from '@/components/plc/redesignMockup/fixtures';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import type { PlcUpdate } from '@/types';
import type { AckRoster } from '@/utils/teamUpdates';
import { UpdatesView } from '../updates/UpdatesView';
import { UpdateHeroView } from '../updates/UpdateHero';
import { BuildingHubView } from './BuildingHubView';

const BLDG_PAGES: ShellPage[] = [
  { id: 'hub', label: 'Hub', icon: LayoutDashboard },
  { id: 'resources', label: 'Resources', icon: Sparkles },
  { id: 'updates', label: 'Updates', icon: Megaphone },
];

const ME = 'me';
const at = (month: number, day: number) =>
  new Date(2026, month - 1, day, 9).getTime();
const reacts = (n: number): Record<string, true> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}`, true]));

const update = (
  id: string,
  p: Pick<PlcUpdate, 'title' | 'authorName' | 'body' | 'createdAt'> &
    Partial<PlcUpdate>
): PlcUpdate => ({
  id,
  requiresAck: false,
  inDigest: true,
  pinned: false,
  reactions: {},
  authorUid: p.authorName,
  updatedAt: p.createdAt,
  ...p,
});

const UPDATES: PlcUpdate[] = [
  update('conf', {
    title: 'Conference week schedule',
    authorName: 'Erin Walsh',
    createdAt: at(10, 6),
    body: 'Conferences run Oct 20 to 23. Sign-up opens to families Monday. Block your unavailable times by Friday.',
    attachment: {
      name: 'Conference schedule.pdf',
      url: 'https://drive.google.com/file/d/conf/view',
    },
    reactions: reacts(18),
    pinned: true,
  }),
  update('super', {
    title: 'October supervision schedule',
    authorName: 'Mark Johnson',
    createdAt: at(10, 3),
    body: 'Lunch and hallway duty changed for weeks 2 and 3. Check your new times before Monday.',
    attachment: {
      name: 'Supervision Oct.pdf',
      url: 'https://drive.google.com/file/d/super/view',
    },
    reactions: reacts(9),
    requiresAck: true,
  }),
  update('drill', {
    title: 'Fire drill Thursday at 10:15',
    authorName: 'Mark Johnson',
    createdAt: at(10, 2),
    body: 'Use the north stairwell route. Sweep cards are in your sub folder.',
    reactions: reacts(4),
  }),
  update('retake', {
    title: 'Picture retake day Oct 21',
    authorName: 'Erin Walsh',
    createdAt: at(9, 29),
    body: 'Send students with a retake slip to the gym during advisory.',
    reactions: reacts(2),
  }),
];

const ROSTER: AckRoster = {
  total: 58,
  notYet: STAFF.slice(9, 26).map((name) => ({ uid: name, name })),
  acknowledged: Array.from({ length: 41 }, (_, i) => ({
    uid: `a${i}`,
    name: STAFF[i] ?? `Staff member ${i + 1}`,
    ackedAt: at(10, 3 + (i % 4)),
  })),
};

const QUICK_LINKS = [
  'Staff handbook',
  'Sub request',
  'Tech help ticket',
  'Bell schedule',
  'Copy center request',
  'Staff directory',
].map((title) => ({ id: title, title, url: 'https://example.org' }));

const CATEGORIES = [
  {
    label: 'Schedules',
    items: [
      'Bell schedule 2026-27',
      'Advisory calendar',
      'Supervision rotation',
    ],
  },
  {
    label: 'Forms',
    items: ['Field trip request', 'Purchase request', 'Leave request'],
  },
  {
    label: 'Safety',
    items: ['Emergency procedures', 'Reunification map', 'Medical alerts list'],
  },
].map((c) => ({
  label: c.label,
  items: c.items.map((title) => ({ id: title, title })),
}));

const CALENDAR_URL =
  'https://calendar.google.com/calendar/embed?src=staff%40example.org';

const calendarFixture = (
  <CalendarEmbed
    name="OMS staff calendar"
    events={[
      ['Wed Oct 8', 'Staff meeting, 3:15 PM, media center'],
      ['Thu Oct 9', 'Fire drill, 10:15 AM'],
      ['Fri Oct 10', 'Conference availability due'],
      ['Mon Oct 13', 'PBIS team, 7:30 AM'],
      ['Mon Oct 20', 'Conferences begin'],
      ['Tue Oct 21', 'Picture retakes'],
    ]}
  />
);

type Screen = 'bldg' | 'updates';

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    screen: (params.get('screen') === 'updates' ? 'updates' : 'bldg') as Screen,
    lead: params.get('role') !== 'member',
    capture: params.get('capture') === '1',
  };
}

export const TeamsB4DevHarness: React.FC = () => {
  const [initial] = useState(readParams);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [lead, setLead] = useState(initial.lead);
  const [updates, setUpdates] = useState(UPDATES);
  const [myAcks, setMyAcks] = useState<Record<string, number>>({});

  const react = (id: string, reacted: boolean) =>
    setUpdates((list) =>
      list.map((u) => {
        if (u.id !== id) return u;
        const reactions = { ...u.reactions };
        if (reacted) reactions[ME] = true;
        else delete reactions[ME];
        return { ...u, reactions };
      })
    );

  const hero = updates[0];
  const body =
    screen === 'bldg' ? (
      <BuildingHubView
        cards={BUILT_IN_TEAM_TYPE_PRESETS.building.cards}
        isLead={lead}
        myUid={ME}
        hero={
          <UpdateHeroView
            update={hero}
            isLead={lead}
            myUid={ME}
            onReact={react}
          />
        }
        heroLabel="Pinned update"
        quickLinks={QUICK_LINKS}
        latest={updates.slice(1)}
        myAcks={myAcks}
        categories={CATEGORIES}
        calendarUrl={CALENDAR_URL}
        calendarEmbed={calendarFixture}
        onAllUpdates={() => setScreen('updates')}
      />
    ) : (
      <UpdatesView
        key={String(lead)}
        updates={updates}
        isLead={lead}
        myUid={ME}
        myAcks={myAcks}
        rosters={lead ? { super: ROSTER } : {}}
        onPost={() => Promise.resolve()}
        onAttach={() => Promise.resolve(null)}
        onEdit={() => Promise.resolve()}
        onReact={react}
        onAck={(id) => setMyAcks((a) => ({ ...a, [id]: at(10, 7) }))}
        onPin={(id, pinned) =>
          setUpdates((list) =>
            list.map((u) => (u.id === id ? { ...u, pinned } : u))
          )
        }
      />
    );

  return (
    <div
      className={`flex flex-col bg-white font-sans ${initial.capture ? 'min-h-screen' : 'h-screen [height:100dvh] overflow-hidden'}`}
      data-capture={initial.capture || undefined}
    >
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
            <option value="bldg">5a. Building Hub</option>
            <option value="updates">5b. Building Updates</option>
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
      </div>
      <div
        className={initial.capture ? 'flex flex-1 flex-col' : 'min-h-0 flex-1'}
      >
        <TeamShell
          team={BLDG_TEAM}
          pages={BLDG_PAGES}
          activePage={screen === 'bldg' ? 'hub' : 'updates'}
          overlay={null}
          onOverlay={() => undefined}
          onPage={(id) => setScreen(id === 'updates' ? 'updates' : 'bldg')}
          isLead={lead}
        >
          {body}
        </TeamShell>
      </div>
    </div>
  );
};
