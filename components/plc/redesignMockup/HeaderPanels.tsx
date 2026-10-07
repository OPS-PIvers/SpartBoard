// Team gear menu, What's new / My items drawer and Members popover (T8, T10).

import React from 'react';
import { LayoutTemplate, Settings, Users2, X } from 'lucide-react';
import { PlcActivityRow } from '@/components/plc/activity/PlcActivityFeed';
import { splitSinceYouWereHere } from '@/components/plc/activity/activityDescriptions';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { initials } from '@/components/plc/home/avatarInitials';
import { ACTIVITY, LAST_SEEN, type MockTeam } from './fixtures';
import {
  ActionItem,
  EYEBROW,
  MENU_ITEM,
  MENU_PANEL,
  META,
  RowList,
  StatusLabel,
  TextLink,
} from './ui';

export const GearMenu: React.FC<{
  isLead: boolean;
  onMembers: () => void;
  onLayout: () => void;
}> = ({ isLead, onMembers, onLayout }) => (
  <div
    role="menu"
    aria-label="Team menu"
    className={`absolute right-14 top-full z-popover mt-1 w-48 text-slate-700 ${MENU_PANEL}`}
  >
    <button
      type="button"
      role="menuitem"
      className={MENU_ITEM}
      onClick={onMembers}
    >
      <Users2 className="h-3.5 w-3.5" aria-hidden="true" />
      Members
    </button>
    <button type="button" role="menuitem" className={MENU_ITEM}>
      <Settings className="h-3.5 w-3.5" aria-hidden="true" />
      Settings
    </button>
    {isLead && (
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM}
        onClick={onLayout}
      >
        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
        Edit layout
      </button>
    )}
  </div>
);

export const MembersPopover: React.FC<{
  team: MockTeam;
  isLead: boolean;
}> = ({ team, isLead }) => (
  <div
    role="dialog"
    aria-label="Members"
    className={`absolute left-4 top-full z-popover mt-1 w-80 px-4 md:left-6 ${MENU_PANEL}`}
  >
    <div className="flex items-center py-2">
      <span className="text-sm font-bold text-slate-800">
        {team.memberCount} members
      </span>
      <span className="flex-1" />
      {isLead && <TextLink>Manage</TextLink>}
    </div>
    <RowList>
      {team.members.map((m) => (
        <li key={m.name} className="flex items-center gap-3 py-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600"
            aria-hidden="true"
          >
            {initials(m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-800">{m.name}</p>
            <p className={META}>{m.role}</p>
          </div>
          {m.online && <StatusLabel tone="done">Here now</StatusLabel>}
        </li>
      ))}
    </RowList>
  </div>
);

const MY_ITEMS = [
  {
    title: 'Build a 3-question exit ticket for Q5',
    from: 'PLC meeting Oct 2',
    when: 'Due Oct 13',
  },
  {
    title: 'Tag Unit 4 Quick Check questions',
    from: 'PLC meeting Oct 2',
    when: 'Due Oct 10',
  },
  {
    title: 'Share the Unit 3 answer key',
    from: 'PLC meeting Sep 25',
    when: 'Done Sep 29',
    done: true,
  },
];

export const TeamDrawer: React.FC<{
  team: MockTeam;
  tab: 'whatsnew' | 'myitems';
  onTab: (tab: 'whatsnew' | 'myitems') => void;
  onClose: () => void;
}> = ({ team, tab, onTab, onClose }) => {
  const { since, older } = splitSinceYouWereHere(ACTIVITY, LAST_SEEN);
  return (
    <aside
      aria-label="What's new and my items"
      className="fixed inset-y-0 right-0 z-drawer flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-lg motion-safe:animate-in motion-safe:slide-in-from-right-2 motion-safe:duration-200"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4 md:h-16">
        <SegmentedControl
          value={tab}
          onChange={onTab}
          ariaLabel="What's new and my items"
          options={[
            { value: 'whatsnew', label: `What's new · ${team.whatsNew}` },
            { value: 'myitems', label: `My items · ${team.myItems}` },
          ]}
        />
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-8">
        {tab === 'whatsnew' ? (
          <>
            <div className="flex items-center px-3 pb-1 pt-4">
              <h3 className={EYEBROW}>Since you were here Oct 2</h3>
              <span className="flex-1" />
              <TextLink quiet>Mark all seen</TextLink>
            </div>
            <ul className="space-y-0.5">
              {since.map((event) => (
                <PlcActivityRow key={event.id} event={event} selfUid="me" />
              ))}
            </ul>
            <h3 className={`${EYEBROW} px-3 pb-1 pt-5`}>Earlier</h3>
            <ul className="space-y-0.5 opacity-75">
              {older.map((event) => (
                <PlcActivityRow key={event.id} event={event} selfUid="me" />
              ))}
            </ul>
          </>
        ) : (
          <div className="px-3 pt-2">
            <RowList label="My items">
              {MY_ITEMS.map((item) => (
                <ActionItem
                  key={item.title}
                  title={item.title}
                  done={item.done}
                  meta={
                    <>
                      From{' '}
                      <span className="font-semibold text-brand-blue-primary">
                        {item.from}
                      </span>
                    </>
                  }
                  trailing={<span className={META}>{item.when}</span>}
                />
              ))}
            </RowList>
          </div>
        )}
      </div>
    </aside>
  );
};
