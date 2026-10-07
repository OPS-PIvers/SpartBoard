// Team gear menu, Members popover, What's new / My items drawer and the live meeting banner (T7, T8, T10).

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  LayoutTemplate,
  Mic,
  Settings,
  Target,
  Users2,
  X,
} from 'lucide-react';
import type { PlcActivityEvent } from '@/types';
import { PlcActivityRow } from '@/components/plc/activity/PlcActivityFeed';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Button } from '@/components/common/Button';
import { initials } from '@/components/plc/home/avatarInitials';
import {
  EYEBROW,
  MENU_ITEM,
  MENU_PANEL,
  META,
  RowList,
  StatusLabel,
  TextLink,
} from '@/components/plc/redesignMockup/ui';

export const GearMenuView: React.FC<{
  isLead: boolean;
  onMembers: () => void;
  onSettings: () => void;
  onLayout: () => void;
  /** Absent when the team has no quizzes or video activities. */
  onTargets?: () => void;
}> = ({ isLead, onMembers, onSettings, onLayout, onTargets }) => {
  const { t } = useTranslation();
  return (
    <div
      role="menu"
      aria-label={t('teams.header.teamMenu', { defaultValue: 'Team menu' })}
      data-team-overlay
      className={`absolute right-14 top-full z-popover mt-1 w-48 text-slate-700 ${MENU_PANEL}`}
    >
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM}
        onClick={onMembers}
      >
        <Users2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t('plcDashboard.tabs.members', { defaultValue: 'Members' })}
      </button>
      {onTargets && (
        <button
          type="button"
          role="menuitem"
          className={MENU_ITEM}
          onClick={onTargets}
        >
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {t('plcDashboard.tabs.targets', {
            defaultValue: 'Learning Targets',
          })}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM}
        onClick={onSettings}
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
        {t('plcDashboard.tabs.settings', { defaultValue: 'Settings' })}
      </button>
      {isLead && (
        <button
          type="button"
          role="menuitem"
          className={MENU_ITEM}
          onClick={onLayout}
        >
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
          {t('teams.header.editLayout', { defaultValue: 'Edit layout' })}
        </button>
      )}
    </div>
  );
};

export interface TeamMemberRow {
  id: string;
  name: string;
  roleLabel: string;
  online: boolean;
}

export const MembersPopoverView: React.FC<{
  members: TeamMemberRow[];
  memberCount: number;
  isLead: boolean;
  onManage: () => void;
}> = ({ members, memberCount, isLead, onManage }) => {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-label={t('plcDashboard.tabs.members', { defaultValue: 'Members' })}
      data-team-overlay
      className={`absolute left-4 top-full z-popover mt-1 flex max-h-[70vh] w-80 flex-col px-4 md:left-6 ${MENU_PANEL}`}
    >
      <div className="flex shrink-0 items-center py-2">
        <span className="text-sm font-bold text-slate-800">
          {t('teams.members.count', {
            count: memberCount,
            defaultValue: '{{count}} member',
            defaultValue_other: '{{count}} members',
          })}
        </span>
        <span className="flex-1" />
        {isLead && (
          <TextLink onClick={onManage}>
            {t('teams.members.manage', { defaultValue: 'Manage' })}
          </TextLink>
        )}
      </div>
      <div className="min-h-0 overflow-y-auto pb-1">
        <RowList>
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600"
                aria-hidden="true"
              >
                {initials(m.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">{m.name}</p>
                <p className={META}>{m.roleLabel}</p>
              </div>
              {m.online && (
                <StatusLabel tone="done">
                  {t('teams.members.hereNow', { defaultValue: 'Here now' })}
                </StatusLabel>
              )}
            </li>
          ))}
        </RowList>
      </div>
    </div>
  );
};

export interface TeamMyItemRow {
  id: string;
  title: string;
  from: string;
  when: string | null;
  done: boolean;
}

const MyItemRow: React.FC<{
  item: TeamMyItemRow;
  onToggle?: () => void;
}> = ({ item, onToggle }) => {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.title}
        disabled={item.done}
        onClick={onToggle}
        className={`shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
          item.done
            ? 'text-emerald-500'
            : 'text-slate-300 hover:text-emerald-500'
        }`}
      >
        {item.done ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Circle className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
        >
          {item.title}
        </p>
        <p className={`${META} mt-0.5 truncate`}>
          {t('teams.myItems.from', { defaultValue: 'From' })}{' '}
          <span className="font-semibold text-brand-blue-primary">
            {item.from}
          </span>
        </p>
      </div>
      {item.when && <span className={`${META} shrink-0`}>{item.when}</span>}
    </li>
  );
};

export type TeamDrawerTab = 'whatsnew' | 'myitems';

export const TeamDrawerView: React.FC<{
  tab: TeamDrawerTab;
  onTab: (tab: TeamDrawerTab) => void;
  onClose: () => void;
  whatsNew: number;
  myItemsCount: number;
  sinceLabel: string;
  since: readonly PlcActivityEvent[];
  older: readonly PlcActivityEvent[];
  selfUid: string | null;
  onMarkAllSeen?: () => void;
  items: TeamMyItemRow[];
  onToggleItem?: (id: string) => void;
}> = ({
  tab,
  onTab,
  onClose,
  whatsNew,
  myItemsCount,
  sinceLabel,
  since,
  older,
  selfUid,
  onMarkAllSeen,
  items,
  onToggleItem,
}) => {
  const { t } = useTranslation();
  const tabsLabel = t('teams.drawer.label', {
    defaultValue: "What's new and my items",
  });
  return (
    <aside
      aria-label={tabsLabel}
      data-team-overlay
      className="fixed inset-y-0 right-0 z-drawer flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-lg motion-safe:animate-in motion-safe:slide-in-from-right-2 motion-safe:duration-200"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4 md:h-16">
        <SegmentedControl
          value={tab}
          onChange={onTab}
          ariaLabel={tabsLabel}
          options={[
            {
              value: 'whatsnew',
              label: t('teams.header.whatsNewCount', {
                count: whatsNew,
                defaultValue: "What's new · {{count}}",
              }),
            },
            {
              value: 'myitems',
              label: t('teams.header.myItemsCount', {
                count: myItemsCount,
                defaultValue: 'My items · {{count}}',
              }),
            },
          ]}
        />
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('plcDashboard.close', { defaultValue: 'Close' })}
          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-8">
        {tab === 'whatsnew' ? (
          <>
            <div className="flex items-center px-3 pb-1 pt-4">
              <h3 className={EYEBROW}>{sinceLabel}</h3>
              <span className="flex-1" />
              {since.length > 0 && onMarkAllSeen && (
                <TextLink quiet onClick={onMarkAllSeen}>
                  {t('teams.drawer.markAllSeen', {
                    defaultValue: 'Mark all seen',
                  })}
                </TextLink>
              )}
            </div>
            {since.length > 0 ? (
              <ul className="space-y-0.5">
                {since.map((event) => (
                  <PlcActivityRow
                    key={event.id}
                    event={event}
                    selfUid={selfUid}
                  />
                ))}
              </ul>
            ) : (
              <p className={`${META} px-3 py-2`}>
                {t('plcDashboard.activity.caughtUp', {
                  defaultValue: 'You’re all caught up',
                })}
              </p>
            )}
            {older.length > 0 && (
              <>
                <h3 className={`${EYEBROW} px-3 pb-1 pt-5`}>
                  {t('plcDashboard.activity.olderHeading', {
                    defaultValue: 'Earlier',
                  })}
                </h3>
                <ul className="space-y-0.5 opacity-75">
                  {older.map((event) => (
                    <PlcActivityRow
                      key={event.id}
                      event={event}
                      selfUid={selfUid}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <div className="px-3 pt-2">
            {items.length > 0 ? (
              <RowList
                label={t('teams.header.myItems', { defaultValue: 'My items' })}
              >
                {items.map((item) => (
                  <MyItemRow
                    key={item.id}
                    item={item}
                    onToggle={
                      onToggleItem ? () => onToggleItem(item.id) : undefined
                    }
                  />
                ))}
              </RowList>
            ) : (
              <p className={`${META} py-2`}>
                {t('plcDashboard.home.actionItems.empty', {
                  defaultValue: "You're all caught up",
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export const MeetingBannerView: React.FC<{
  meta: string;
  onJoin: () => void;
}> = ({ meta, onJoin }) => {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-brand-blue-lighter px-4 py-2 text-sm text-brand-blue-dark md:px-6">
      <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-bold">
        {t('teams.meeting.inProgress', {
          defaultValue: 'Meeting in progress',
        })}
      </span>
      <span className="truncate text-xs">{meta}</span>
      <span className="flex-1" />
      <Button size="sm" onClick={onJoin}>
        {t('teams.meeting.join', { defaultValue: 'Join' })}
      </Button>
    </div>
  );
};
