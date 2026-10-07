// The redesigned team page (T1, T2, T4 to T10, T35), mounted by PlcDashboard when the teams-redesign flag is on.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { getPlcGroupType, type Plc, type TeamPageId } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  usePlcActions,
  usePlcActivity,
  usePlcMeetingsData,
  usePlcMembers,
  usePlcNotesData,
  usePlcWhoIsHere,
} from '@/context/usePlcContext';
import { useGoogleTasksPull } from '@/hooks/useGoogleTasksPull';
import { usePlcUnread } from '@/hooks/usePlcUnread';
import {
  saveTeamLayout,
  useTeamTypeDefaultsState,
} from '@/hooks/useTeamLayout';
import { resolveTeamLayout } from '@/utils/teamLayout';
import { getPlcRole } from '@/utils/plc';
import { isForeignMentionEvent } from '@/utils/plcActivity';
import { logError } from '@/utils/logError';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import {
  buildPlcDocPath,
  buildPlcPath,
  spaNavigate,
  spaReplace,
} from '@/utils/plcPath';
import type { PlcSectionId } from '@/components/plc/sections';
import { splitSinceYouWereHere } from '@/components/plc/activity/activityDescriptions';
import { pickInProgressMeeting } from '@/components/plc/home/tiles/meetingSelectors';
import { PlcSearchBox } from '@/components/plc/search/PlcSearchBox';
import { MembersBody } from '@/components/plc/bodies/MembersBody';
import { PlcSettingsTab } from '@/components/plc/tabs/PlcSettingsTab';
import { PlcMeetingMode } from '@/components/plc/meeting/PlcMeetingMode';
import { TEAM_PAGE_REGISTRY } from '@/components/plc/teams/pageRegistry';
import {
  TeamNavContext,
  type TeamNav,
} from '@/components/plc/teams/TeamNavContext';
import { TeamPagePlaceholder } from '@/components/plc/teams/TeamPlaceholder';
import { TeamNotesDocsPage } from '@/components/plc/teams/pages/ExistingTeamPages';
import { TeamShellActionsContext } from '@/components/plc/teams/data/teamShellActions';
import {
  teamPageLabel,
  teamTypeLabel,
} from '@/components/plc/teams/teamLabels';
import {
  resolveTeamRoute,
  teamPageSection,
} from '@/components/plc/teams/teamSections';
import { TeamShellView, type TeamOverlay } from './TeamShellView';
import {
  GearMenuView,
  MeetingBannerView,
  MembersPopoverView,
  TeamDrawerView,
  type TeamDrawerTab,
  type TeamMyItemRow,
} from './TeamHeaderPanels';
import { TeamLayoutEditor } from './TeamLayoutEditor';
import { selectMyItems } from './myItems';
import {
  formatShortDate,
  meetingBannerMeta,
  roleLabel,
  selectAvatarPeople,
  selectMemberRows,
} from './teamShellData';

const OLDER_LIMIT = 10;

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !==
      null);

interface TeamDashboardProps {
  plc: Plc;
  activeSection: PlcSectionId;
  meetingId: string | null;
  assessmentId: string | null;
  docId: string | null;
  onClose: () => void;
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({
  plc,
  activeSection: requestedSection,
  meetingId,
  assessmentId,
  docId,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user, canAccessFeature } = useAuth();
  const { addToast } = useDashboard();
  const { updateNote } = usePlcActions();
  useGoogleTasksPull(plc.id, canAccessFeature('google-tasks-sync'));
  const uid = user?.uid ?? null;
  const [now] = useState(() => Date.now());

  const { defaults: adminDefaults, failed: defaultsFailed } =
    useTeamTypeDefaultsState();
  const layoutReady = adminDefaults !== null || plc.layout !== undefined;
  const layout = useMemo(
    () => resolveTeamLayout(plc, adminDefaults),
    [plc, adminDefaults]
  );
  const groupType = getPlcGroupType(plc);
  const role = uid ? getPlcRole(plc, uid) : null;
  const isLead = role === 'lead' || role === 'coLead';

  const { route, canonical } = resolveTeamRoute(requestedSection, layout);
  useEffect(() => {
    if (layoutReady && canonical !== requestedSection) {
      spaReplace(buildPlcPath(plc.id, canonical));
    }
  }, [layoutReady, canonical, requestedSection, plc.id]);

  const [overlay, setOverlay] = useState<TeamOverlay>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(
    requestedSection === 'home'
  );

  // Escape closes the open panel first, then the team page; never from a text field or editor.
  useEffect(() => {
    if (editorOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (isEscapeFromWidgetInput(event) || isTextEntry(event.target)) return;
      if (overlay) setOverlay(null);
      else onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editorOpen, overlay, onClose]);

  // A click outside the open popover or drawer closes it.
  useEffect(() => {
    if (!overlay) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-team-overlay],[data-team-overlay-toggle]')) {
        return;
      }
      setOverlay(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overlay]);

  // Header data: activity cursor, my action items, members and presence.
  const activity = usePlcActivity();
  const { lastSeenAt, unreadCount, markSeen } = usePlcUnread(plc.id, {
    activity,
  });
  const focusSearch = useCallback((el: HTMLDivElement | null) => {
    el?.querySelector('input')?.focus();
  }, []);
  const [drawerCursor, setDrawerCursor] = useState<number | null>(null);
  const { data: notes } = usePlcNotesData();
  const myItems = useMemo(
    () => selectMyItems(notes, uid, now),
    [notes, uid, now]
  );
  const members = usePlcMembers();
  const here = usePlcWhoIsHere();
  const memberRows = useMemo(
    () => selectMemberRows(t, members, here),
    [t, members, here]
  );
  const people = useMemo(
    () => selectAvatarPeople(t, memberRows),
    [t, memberRows]
  );
  const { data: meetings } = usePlcMeetingsData();
  const liveMeeting = useMemo(
    () => pickInProgressMeeting(meetings),
    [meetings]
  );

  const navigate = (section: PlcSectionId) => {
    setShowMobileMenu(false);
    setOverlay(null);
    if (section !== canonical) spaNavigate(buildPlcPath(plc.id, section));
  };

  const openOverlay = (next: TeamOverlay) => {
    if (next === 'whatsnew' || next === 'myitems') {
      if (overlay !== 'whatsnew' && overlay !== 'myitems') {
        setDrawerCursor(lastSeenAt);
      }
    }
    setOverlay(next);
  };

  const openLayoutEditor = () => {
    if (!isLead) return;
    setOverlay(null);
    // Unreadable admin defaults: freezing or saving now would pin the built-in presets.
    if (!plc.layout && defaultsFailed) {
      addToast(
        t('teams.layout.defaultsFailed', {
          defaultValue: "Couldn't load the district layout. Try again later.",
        }),
        'error'
      );
      return;
    }
    setEditorOpen(true);
    // T35: the first open freezes the resolved layout onto the team (T3).
    if (!plc.layout) {
      saveTeamLayout(plc.id, layout).catch((err: unknown) =>
        logError('TeamDashboard.freezeLayout', err, { plcId: plc.id })
      );
    }
  };

  const nav: TeamNav = {
    navigate,
    openDoc: (id) => {
      setShowMobileMenu(false);
      spaNavigate(buildPlcDocPath(plc.id, id));
    },
    close: onClose,
    openLayoutEditor,
    assessmentId,
    docId,
    layout,
  };

  const notesSidePanels =
    route.kind === 'page' &&
    route.page === 'docs' &&
    canAccessFeature('plc-notes-unified') &&
    canAccessFeature('plc-notes-side-panels');

  const railPages = layout.pages
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      label: teamPageLabel(t, p.id, isLead),
      icon: TEAM_PAGE_REGISTRY[p.id].icon,
    }));
  const activePage = route.kind === 'page' ? route.page : null;
  const activeLabel =
    route.kind === 'page'
      ? teamPageLabel(t, route.page, isLead)
      : route.section === 'members'
        ? t('plcDashboard.tabs.members', { defaultValue: 'Members' })
        : route.section === 'settings'
          ? t('plcDashboard.tabs.settings', { defaultValue: 'Settings' })
          : undefined;

  const renderBody = (): React.ReactNode => {
    if (!layoutReady) {
      return (
        <div className="flex justify-center py-16">
          <Loader2
            className="h-8 w-8 animate-spin text-brand-blue-primary"
            aria-label={t('plcRoute.groupLoading', {
              defaultValue: 'Loading team…',
            })}
          />
        </div>
      );
    }
    if (route.kind === 'section') {
      if (route.section === 'meeting') {
        return (
          <PlcMeetingMode
            plc={plc}
            meetingId={meetingId}
            onNavigate={navigate}
          />
        );
      }
      return (
        <div className="p-4 pb-8 md:p-6">
          {route.section === 'members' ? (
            <MembersBody plc={plc} />
          ) : (
            <PlcSettingsTab plc={plc} />
          )}
        </div>
      );
    }
    const page: TeamPageId = route.page;
    if (page === 'docs') {
      return (
        <TeamNotesDocsPage
          plc={plc}
          layout={layout}
          isLead={isLead}
          fullBleed={notesSidePanels}
        />
      );
    }
    const entry = TEAM_PAGE_REGISTRY[page];
    const Component = entry.byType?.[groupType] ?? entry.Component;
    return Component ? (
      <Component
        plc={plc}
        layout={layout}
        isLead={isLead}
        onNavigate={(id) => navigate(teamPageSection(id))}
        onChangeHero={isLead ? openLayoutEditor : undefined}
      />
    ) : (
      <TeamPagePlaceholder label={teamPageLabel(t, page, isLead)} />
    );
  };

  const fullBleed =
    (route.kind === 'section' && route.section === 'meeting') ||
    notesSidePanels ||
    (route.kind === 'page' && !!TEAM_PAGE_REGISTRY[route.page].fullBleed);

  const drawerTab: TeamDrawerTab | null =
    overlay === 'whatsnew' || overlay === 'myitems' ? overlay : null;
  const visibleActivity = drawerTab
    ? activity.filter((e) => !isForeignMentionEvent(e, uid))
    : [];
  const { since, older } = splitSinceYouWereHere(visibleActivity, drawerCursor);
  const itemRows: TeamMyItemRow[] = [
    ...myItems.open.map((v) => ({
      id: v.item.id,
      title: v.item.text,
      from: v.note.title,
      when:
        v.item.dueAt != null
          ? t('teams.myItems.due', {
              date: formatShortDate(v.item.dueAt),
              defaultValue: 'Due {{date}}',
            })
          : null,
      done: false,
    })),
    ...myItems.done.map((v) => ({
      id: v.item.id,
      title: v.item.text,
      from: v.note.title,
      when:
        v.item.doneAt != null
          ? t('teams.myItems.done', {
              date: formatShortDate(v.item.doneAt),
              defaultValue: 'Done {{date}}',
            })
          : null,
      done: true,
    })),
  ];

  const completeItem = (itemId: string) => {
    const view = myItems.open.find((v) => v.item.id === itemId);
    if (!view) return;
    const next = (view.note.actionItems ?? []).map((ai) =>
      ai.id === itemId ? { ...ai, done: true, doneAt: Date.now() } : ai
    );
    updateNote(
      view.note.id,
      { actionItems: next },
      { expectedVersion: view.note.version }
    ).catch((err: unknown) => {
      logError('TeamDashboard.completeItem', err, {
        plcId: plc.id,
        noteId: view.note.id,
      });
      addToast(
        t('plcDashboard.home.actionItems.toggleFailed', {
          defaultValue: "Couldn't update that action item.",
        }),
        'error'
      );
    });
  };

  const sinceLabel =
    drawerCursor !== null
      ? t('teams.drawer.sinceDate', {
          date: formatShortDate(drawerCursor),
          defaultValue: 'Since you were here {{date}}',
        })
      : t('plcDashboard.activity.sinceLastVisit', {
          defaultValue: 'Since you were here',
        });

  const showBanner =
    liveMeeting !== null &&
    !(route.kind === 'section' && route.section === 'meeting');

  const shellActions = {
    openLayoutEditor: isLead ? openLayoutEditor : undefined,
    openMyItems: () => openOverlay('myitems'),
  };

  return (
    <TeamNavContext.Provider value={nav}>
      <TeamShellActionsContext.Provider value={shellActions}>
        <div
          className="fixed inset-0 z-modal flex flex-col overscroll-none bg-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plc-dashboard-title"
        >
          <TeamShellView
            name={plc.name}
            typeLabel={teamTypeLabel(t, groupType)}
            whatsNew={unreadCount}
            myItems={myItems.open.length}
            people={people}
            memberCount={memberRows.length}
            roleLabel={isLead && role ? roleLabel(t, role) : null}
            pages={railPages}
            activePage={activePage}
            activeLabel={activeLabel}
            overlay={overlay}
            onOverlay={openOverlay}
            onPage={(id) => navigate(teamPageSection(id as TeamPageId))}
            onClose={onClose}
            showMobileMenu={showMobileMenu && route.kind === 'page'}
            onMobileMenu={() => setShowMobileMenu(true)}
            panelId={activePage ?? canonical}
            fullBleed={fullBleed}
            searchSlot={
              <div ref={focusSearch}>
                <PlcSearchBox plcId={plc.id} onNavigate={navigate} />
              </div>
            }
            banner={
              showBanner && liveMeeting ? (
                <MeetingBannerView
                  meta={meetingBannerMeta(t, liveMeeting, notes, here)}
                  onJoin={() => navigate('meeting')}
                />
              ) : null
            }
            headerPopover={
              overlay === 'gear' ? (
                <GearMenuView
                  isLead={isLead}
                  onMembers={() => navigate('members')}
                  onSettings={() => navigate('settings')}
                  onLayout={openLayoutEditor}
                />
              ) : null
            }
            subHeaderPopover={
              overlay === 'members' ? (
                <MembersPopoverView
                  members={memberRows}
                  memberCount={memberRows.length}
                  isLead={isLead}
                  onManage={() => navigate('members')}
                />
              ) : null
            }
          >
            <div
              key={`${canonical}:${activePage ?? ''}`}
              className={`animate-in fade-in slide-in-from-bottom-2 duration-300 ${fullBleed ? 'h-full' : ''}`}
            >
              {renderBody()}
            </div>
            {drawerTab && (
              <TeamDrawerView
                tab={drawerTab}
                onTab={setOverlay}
                onClose={() => setOverlay(null)}
                whatsNew={unreadCount}
                myItemsCount={myItems.open.length}
                sinceLabel={sinceLabel}
                since={since}
                older={older.slice(0, OLDER_LIMIT)}
                selfUid={uid}
                onMarkAllSeen={() => {
                  markSeen().catch((err: unknown) =>
                    logError('TeamDashboard.markSeen', err, { plcId: plc.id })
                  );
                  setDrawerCursor(Date.now());
                }}
                items={itemRows}
                onToggleItem={completeItem}
              />
            )}
          </TeamShellView>
          {editorOpen && (
            <TeamLayoutEditor
              plc={plc}
              layout={layout}
              adminDefaults={adminDefaults}
              defaultsFailed={defaultsFailed}
              isLead={isLead}
              onClose={() => setEditorOpen(false)}
            />
          )}
        </div>
      </TeamShellActionsContext.Provider>
    </TeamNavContext.Provider>
  );
};
