// The redesigned team page (T1, T2, T4 to T10, T35), mounted by PlcDashboard when the teams-redesign flag is on.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useEffectEvent,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Target } from 'lucide-react';
import {
  getPlcFeatures,
  getPlcGroupType,
  type Plc,
  type TeamPageId,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  usePlcActivity,
  usePlcMembers,
  usePlcNotesData,
  usePlcWhoIsHere,
} from '@/context/usePlcContext';
import { useGoogleTasksPull } from '@/hooks/useGoogleTasksPull';
import { usePlcUnread } from '@/hooks/usePlcUnread';
import { useTeamTypeDefaultsState } from '@/hooks/useTeamLayout';
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
import { PlcSearchBox } from '@/components/plc/search/PlcSearchBox';
import { MembersBody } from '@/components/plc/bodies/MembersBody';
import { PlcLearningTargetsBody } from '@/components/plc/bodies/PlcLearningTargetsBody';
import { PlcMeetingRecordView } from '@/components/plc/meeting/PlcMeetingRecordView';
import { PlcSettingsTab } from '@/components/plc/tabs/PlcSettingsTab';
import { TEAM_PAGE_REGISTRY } from '@/components/plc/teams/pageRegistry';
import {
  TeamNavContext,
  type TeamNav,
} from '@/components/plc/teams/TeamNavContext';
import { TeamPagePlaceholder } from '@/components/plc/teams/TeamPlaceholder';
import { TeamShellActionsContext } from '@/components/plc/teams/data/teamShellActions';
import { useTeamMyItems } from '@/components/plc/teams/notes/useTeamNotes';
import { OPEN_LAYOUT_EDITOR_EVENT } from '@/components/plc/teams/notes/teamNotesNavigation';
import {
  teamPageLabel,
  teamTypeLabel,
} from '@/components/plc/teams/teamLabels';
import {
  resolveTeamRoute,
  teamPageSection,
} from '@/components/plc/teams/teamSections';
import {
  TeamShellView,
  type TeamOverlay,
  type TeamRailItem,
} from './TeamShellView';
import {
  GearMenuView,
  MembersPopoverView,
  TeamDrawerView,
  type TeamDrawerTab,
  type TeamMyItemRow,
} from './TeamHeaderPanels';
import { TeamLayoutEditor } from './TeamLayoutEditor';
import { selectMyItems } from './myItems';
import {
  formatShortDate,
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

  // Meeting Mode is retired (T11): a bare meeting link lands on Notes & Docs; a saved record keeps its URL.
  const section: PlcSectionId =
    requestedSection === 'meeting' && !meetingId ? 'docs' : requestedSection;
  const features = getPlcFeatures(plc);
  const hasTargets = features.quizzes || features.videoActivities;
  const { route, canonical } = resolveTeamRoute(section, layout, {
    targets: hasTargets,
  });
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
  const teamItems = useTeamMyItems(plc);
  const recentDone = useMemo(
    () => selectMyItems(notes, uid, now).done,
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

  const navigate = (requested: PlcSectionId) => {
    setShowMobileMenu(false);
    setOverlay(null);
    const next = requested === 'meeting' ? 'docs' : requested;
    if (next !== canonical) spaNavigate(buildPlcPath(plc.id, next));
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
  };

  // The Department Hub asks for the layout editor through a window event.
  const onLayoutEditorRequest = useEffectEvent((event: Event) => {
    const detail = (event as CustomEvent<{ plcId?: string }>).detail;
    if (detail?.plcId === plc.id) openLayoutEditor();
  });
  useEffect(() => {
    const handler = (event: Event) => onLayoutEditorRequest(event);
    window.addEventListener(OPEN_LAYOUT_EDITOR_EVENT, handler);
    return () => window.removeEventListener(OPEN_LAYOUT_EDITOR_EVENT, handler);
  }, []);

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
    meetingId,
    section: requestedSection,
    layout,
  };

  const railPages: TeamRailItem[] = layout.pages
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      label: teamPageLabel(t, p.id, isLead),
      icon: TEAM_PAGE_REGISTRY[p.id].icon,
    }));
  // Learning Targets sits after Assessments (or the data page), as on the legacy rail.
  if (hasTargets) {
    const after = railPages.findIndex((p) => p.id === 'assessments');
    const anchor =
      after >= 0 ? after : railPages.findIndex((p) => p.id === 'dataOverview');
    railPages.splice(anchor >= 0 ? anchor + 1 : railPages.length, 0, {
      id: 'targets',
      label: t('plcDashboard.tabs.targets', {
        defaultValue: 'Learning Targets',
      }),
      icon: Target,
    });
  }
  const activePage =
    route.kind === 'page'
      ? route.page
      : route.section === 'targets'
        ? 'targets'
        : null;
  const activeLabel =
    route.kind === 'page'
      ? teamPageLabel(t, route.page, isLead)
      : route.section === 'members'
        ? t('plcDashboard.tabs.members', { defaultValue: 'Members' })
        : route.section === 'settings'
          ? t('plcDashboard.tabs.settings', { defaultValue: 'Settings' })
          : route.section === 'targets'
            ? t('plcDashboard.tabs.targets', {
                defaultValue: 'Learning Targets',
              })
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
    if (route.kind === 'section' && route.section === 'meeting') {
      return <PlcMeetingRecordView plc={plc} meetingId={meetingId ?? ''} />;
    }
    if (route.kind === 'section') {
      return (
        <div className="p-4 pb-8 md:p-6">
          {route.section === 'members' ? (
            <MembersBody plc={plc} />
          ) : route.section === 'targets' ? (
            <PlcLearningTargetsBody plc={plc} />
          ) : (
            <PlcSettingsTab plc={plc} />
          )}
        </div>
      );
    }
    const page: TeamPageId = route.page;
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
    route.kind === 'page' && !!TEAM_PAGE_REGISTRY[route.page].fullBleed;

  const drawerTab: TeamDrawerTab | null =
    overlay === 'whatsnew' || overlay === 'myitems' ? overlay : null;
  const visibleActivity = drawerTab
    ? activity.filter((e) => !isForeignMentionEvent(e, uid))
    : [];
  const { since, older } = splitSinceYouWereHere(visibleActivity, drawerCursor);
  const itemRows: TeamMyItemRow[] = [
    ...teamItems.items.map((v) => ({
      id: v.item.id,
      title: v.item.text,
      from: v.source.kind === 'note' ? v.source.note.title : v.source.doc.title,
      when:
        v.item.dueAt != null
          ? t('teams.myItems.due', {
              date: formatShortDate(v.item.dueAt),
              defaultValue: 'Due {{date}}',
            })
          : null,
      done: false,
    })),
    ...recentDone.map((v) => ({
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
    const view = teamItems.items.find((v) => v.item.id === itemId);
    if (!view) return;
    teamItems.setDone(view, true).catch(() =>
      addToast(
        t('plcDashboard.home.actionItems.toggleFailed', {
          defaultValue: "Couldn't update that action item.",
        }),
        'error'
      )
    );
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
            myItems={teamItems.count}
            people={people}
            memberCount={memberRows.length}
            roleLabel={isLead && role ? roleLabel(t, role) : null}
            pages={railPages}
            activePage={activePage}
            activeLabel={activeLabel}
            overlay={overlay}
            onOverlay={openOverlay}
            onPage={(id) =>
              navigate(
                id === 'targets' ? 'targets' : teamPageSection(id as TeamPageId)
              )
            }
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
              key={`${canonical}:${activePage ?? ''}:${activePage === 'docs' ? (docId ?? '') : ''}`}
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
                myItemsCount={teamItems.count}
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
