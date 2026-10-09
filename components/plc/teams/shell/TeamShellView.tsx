// Team page shell (T8, T10): header with the What's new / My items pair, search and gear; avatar sub-header; rail.

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Inbox,
  Search,
  Settings as SettingsIcon,
  Users2,
  X,
} from 'lucide-react';
import { PlcDashboardRail } from '@/components/plc/PlcDashboardRail';
import {
  HomeAvatarStack,
  type HomeAvatarPerson,
} from '@/components/plc/home/HomeAvatarCluster';
import { tourAttr } from '@/config/tourAnchors';

export interface TeamRailItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export type TeamOverlay =
  | 'gear'
  | 'whatsnew'
  | 'myitems'
  | 'members'
  | 'search'
  | null;

const HEADER_BTN =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
const HEADER_ICON =
  'rounded-lg p-1.5 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

export interface TeamShellViewProps {
  name: string;
  typeLabel: string;
  whatsNew: number;
  myItems: number;
  people: HomeAvatarPerson[];
  memberCount: number;
  /** "Lead" or "Co-lead" next to the member count. */
  roleLabel?: string | null;
  pages: TeamRailItem[];
  /** Rail page to highlight; null on off-rail sections like Members. */
  activePage: string | null;
  /** Label for the current page on phones. */
  activeLabel?: string;
  overlay: TeamOverlay;
  onOverlay: (next: TeamOverlay) => void;
  onPage: (id: string) => void;
  onClose: () => void;
  /** Rendered in place of the search button while search is open. */
  searchSlot?: React.ReactNode;
  /** Under the sub-header, e.g. the meeting banner. */
  banner?: React.ReactNode;
  headerPopover?: React.ReactNode;
  subHeaderPopover?: React.ReactNode;
  /** Pages with their own scroll regions, like Notes. */
  fullBleed?: boolean;
  /** Phones show the page list instead of the page. */
  showMobileMenu?: boolean;
  onMobileMenu?: () => void;
  /** Panel id suffix; matches the rail tab. */
  panelId: string;
  children: React.ReactNode;
}

export const TeamShellView: React.FC<TeamShellViewProps> = ({
  name,
  typeLabel,
  whatsNew,
  myItems,
  people,
  memberCount,
  roleLabel,
  pages,
  activePage,
  activeLabel,
  overlay,
  onOverlay,
  onPage,
  onClose,
  searchSlot,
  banner,
  headerPopover,
  subHeaderPopover,
  fullBleed = false,
  showMobileMenu = false,
  onMobileMenu,
  panelId,
  children,
}) => {
  const { t } = useTranslation();
  const toggle = (next: Exclude<TeamOverlay, null>) =>
    onOverlay(overlay === next ? null : next);
  const shown = people.slice(0, 5);
  const panelClass = fullBleed
    ? 'flex min-w-0 flex-1 flex-col overflow-hidden bg-white'
    : 'min-w-0 flex-1 overflow-y-auto overscroll-none bg-white';

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="relative flex h-14 shrink-0 items-center gap-2 bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark px-4 text-white shadow-sm md:h-16">
        {!showMobileMenu && onMobileMenu && (
          <button
            type="button"
            onClick={onMobileMenu}
            className="-ml-2 shrink-0 rounded-lg p-2 transition-colors hover:bg-white/20 md:hidden"
            aria-label={t('plcDashboard.backToMenu', { defaultValue: 'Back' })}
          >
            <ArrowLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
        <Users2
          className="hidden h-4 w-4 shrink-0 text-white/70 md:block"
          aria-hidden="true"
        />
        <h2
          id="plc-dashboard-title"
          className="truncate text-base font-bold md:text-lg"
        >
          {name}
        </h2>
        <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-widest text-white/70 md:inline">
          {typeLabel}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={HEADER_BTN}
          aria-expanded={overlay === 'whatsnew'}
          data-team-overlay-toggle
          {...tourAttr('teams.shell.whats-new')}
          onClick={() => toggle('whatsnew')}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">
            {t('teams.header.whatsNew', { defaultValue: "What's new" })}
          </span>
          <span className="tabular-nums">· {whatsNew}</span>
        </button>
        <button
          type="button"
          className={HEADER_BTN}
          aria-expanded={overlay === 'myitems'}
          data-team-overlay-toggle
          {...tourAttr('teams.shell.my-items')}
          onClick={() => toggle('myitems')}
        >
          <Inbox className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">
            {t('teams.header.myItems', { defaultValue: 'My items' })}
          </span>
          <span className="tabular-nums">· {myItems}</span>
        </button>
        <span
          className="mx-1 hidden h-6 w-px bg-white/20 sm:block"
          aria-hidden="true"
        />
        {overlay === 'search' && searchSlot ? (
          <div className="hidden w-64 md:block" data-team-overlay>
            {searchSlot}
          </div>
        ) : (
          <button
            type="button"
            className={`${HEADER_ICON} hidden md:block`}
            aria-label={t('teams.header.search', { defaultValue: 'Search' })}
            title={t('teams.header.search', { defaultValue: 'Search' })}
            {...tourAttr('teams.shell.search')}
            onClick={() => toggle('search')}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={`${HEADER_ICON} ${overlay === 'gear' ? 'bg-white/20' : ''}`}
          aria-label={t('teams.header.teamMenu', { defaultValue: 'Team menu' })}
          title={t('teams.header.teamMenu', { defaultValue: 'Team menu' })}
          aria-expanded={overlay === 'gear'}
          data-team-overlay-toggle
          aria-haspopup="menu"
          {...tourAttr('teams.shell.team-menu')}
          onClick={() => toggle('gear')}
        >
          <SettingsIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={HEADER_ICON}
          aria-label={t('plcDashboard.close', { defaultValue: 'Close' })}
          title={t('plcDashboard.close', { defaultValue: 'Close' })}
          {...tourAttr('teams.shell.close')}
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        {headerPopover}
      </div>

      <div className="relative flex min-h-11 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-1.5 text-xxs text-slate-500 md:px-6">
        <span className="contents" data-team-overlay-toggle>
          <HomeAvatarStack
            people={shown}
            overflow={memberCount - shown.length}
            onClick={() => toggle('members')}
            expanded={overlay === 'members'}
            ariaLabel={t('teams.header.membersButton', {
              count: memberCount,
              defaultValue: '{{count}} members. Open Members',
            })}
          />
        </span>
        <span className="font-semibold uppercase tracking-widest">
          {t('plcDashboard.meta.members', {
            count: memberCount,
            defaultValue: '{{count}} Member',
            defaultValue_other: '{{count}} Members',
          })}
        </span>
        {roleLabel && (
          <>
            <span className="text-slate-300">•</span>
            <span className="font-semibold uppercase tracking-widest text-brand-blue-primary">
              {roleLabel}
            </span>
          </>
        )}
        {!showMobileMenu && activeLabel && (
          <>
            <span className="text-slate-300 md:hidden">•</span>
            <span className="truncate font-semibold text-slate-700 md:hidden">
              {activeLabel}
            </span>
          </>
        )}
        {subHeaderPopover}
      </div>

      {banner}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PlcDashboardRail
          activeSection={activePage ?? ''}
          onSelect={onPage}
          visibleSections={pages}
        />
        {showMobileMenu && (
          <nav className="flex flex-1 flex-col overflow-y-auto py-2 pb-8 md:hidden">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => onPage(page.id)}
                className="flex min-h-[60px] w-full items-center justify-between border-b border-slate-100 p-4 text-left transition-colors last:border-b-0 hover:bg-slate-100 active:bg-slate-200"
              >
                <span className="flex items-center gap-4">
                  <page.icon className="h-5 w-5 text-slate-500" />
                  <span className="text-base font-semibold text-slate-700">
                    {page.label}
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 text-slate-400"
                  aria-hidden="true"
                />
              </button>
            ))}
          </nav>
        )}
        <div
          role="tabpanel"
          id={`plc-panel-${panelId}`}
          aria-labelledby={activePage ? `plc-tab-${activePage}` : undefined}
          className={`${panelClass} ${showMobileMenu ? (fullBleed ? 'hidden md:flex' : 'hidden md:block') : ''}`}
          data-scroll-root={fullBleed ? undefined : true}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
