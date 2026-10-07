// The real PlcDashboard shell (gradient header, meta sub-header, rail) with the redesign's header controls.

import React from 'react';
import {
  Bell,
  Inbox,
  Search,
  Settings as SettingsIcon,
  Users2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { PlcDashboardRail } from '@/components/plc/PlcDashboardRail';
import { HomeAvatarStack } from '@/components/plc/home/HomeAvatarCluster';
import type { MockTeam } from './fixtures';

export interface ShellPage {
  id: string;
  label: string;
  icon: LucideIcon;
}

export type ShellOverlay = 'gear' | 'whatsnew' | 'myitems' | 'members' | null;

const HEADER_BTN =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
const HEADER_ICON =
  'rounded-lg p-1.5 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

export const TeamShell: React.FC<{
  team: MockTeam;
  pages: ShellPage[];
  activePage: string;
  overlay: ShellOverlay;
  onOverlay: (next: ShellOverlay) => void;
  onPage?: (id: string) => void;
  isLead: boolean;
  /** Rendered under the header, e.g. the meeting banner. */
  banner?: React.ReactNode;
  /** Popovers anchored in the header. */
  headerPopover?: React.ReactNode;
  /** Popovers anchored in the sub-header. */
  subHeaderPopover?: React.ReactNode;
  /** Pages with their own scroll regions, like Notes. */
  fullBleed?: boolean;
  children: React.ReactNode;
}> = ({
  team,
  pages,
  activePage,
  overlay,
  onOverlay,
  onPage,
  isLead,
  banner,
  headerPopover,
  subHeaderPopover,
  fullBleed = false,
  children,
}) => {
  const toggle = (next: Exclude<ShellOverlay, null>) =>
    onOverlay(overlay === next ? null : next);
  const shown = team.members.slice(0, 5);
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="relative flex h-14 shrink-0 items-center gap-2 bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark px-4 text-white shadow-sm md:h-16">
        <Users2
          className="hidden h-4 w-4 shrink-0 text-white/70 md:block"
          aria-hidden="true"
        />
        <h2 className="truncate text-base font-bold md:text-lg">{team.name}</h2>
        <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-widest text-white/70 md:inline">
          {team.typeLabel}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={HEADER_BTN}
          aria-expanded={overlay === 'whatsnew'}
          onClick={() => toggle('whatsnew')}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">What&apos;s new</span>
          <span className="tabular-nums">· {team.whatsNew}</span>
        </button>
        <button
          type="button"
          className={HEADER_BTN}
          aria-expanded={overlay === 'myitems'}
          onClick={() => toggle('myitems')}
        >
          <Inbox className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">My items</span>
          <span className="tabular-nums">· {team.myItems}</span>
        </button>
        <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
        <button
          type="button"
          className={HEADER_ICON}
          aria-label="Search"
          title="Search"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${HEADER_ICON} ${overlay === 'gear' ? 'bg-white/20' : ''}`}
          aria-label="Team menu"
          title="Team menu"
          aria-expanded={overlay === 'gear'}
          aria-haspopup="menu"
          onClick={() => toggle('gear')}
        >
          <SettingsIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={HEADER_ICON}
          aria-label="Close"
          title="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        {headerPopover}
      </div>

      <div className="relative flex min-h-11 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-1.5 text-xxs text-slate-500 md:px-6">
        <HomeAvatarStack
          people={shown.map((m) => ({
            id: m.name,
            name: m.name,
            online: m.online,
            title: m.online ? `${m.name}, here now` : m.name,
          }))}
          overflow={team.memberCount - shown.length}
          onClick={() => toggle('members')}
          expanded={overlay === 'members'}
          ariaLabel={`${team.memberCount} members. Open Members`}
        />
        <span className="font-semibold uppercase tracking-widest">
          {team.memberCount} Members
        </span>
        {isLead && (
          <>
            <span className="text-slate-300">•</span>
            <span className="font-semibold uppercase tracking-widest text-brand-blue-primary">
              Lead
            </span>
          </>
        )}
        {subHeaderPopover}
      </div>

      {banner}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PlcDashboardRail
          activeSection={activePage}
          onSelect={(id) => onPage?.(id)}
          visibleSections={pages}
        />
        {fullBleed ? (
          <div
            role="tabpanel"
            id={`plc-panel-${activePage}`}
            aria-labelledby={`plc-tab-${activePage}`}
            className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white"
          >
            {children}
          </div>
        ) : (
          <div
            role="tabpanel"
            id={`plc-panel-${activePage}`}
            aria-labelledby={`plc-tab-${activePage}`}
            className="min-w-0 flex-1 overflow-y-auto bg-white"
            data-scroll-root
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
};
