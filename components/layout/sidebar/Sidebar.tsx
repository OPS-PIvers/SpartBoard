import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/context/useDialog';
import {
  X,
  Menu,
  LogOut,
  Settings,
  LayoutGrid,
  Paintbrush,
  SquareSquare,
  ChevronRight,
  Maximize,
  Minimize,
  ArrowLeft,
  Pencil,
  Trash2,
  Cloud,
  CloudCheck,
  AlertCircle,
  Zap,
  Building2,
  SlidersHorizontal,
  Users,
  Users2,
  Link2,
  Sparkles,
} from 'lucide-react';
import { GoogleDriveIcon } from '@/components/common/GoogleDriveIcon';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { ShortLinkQuickCreate } from '@/components/admin/ShortLinkQuickCreate';
import { WhatsNewModal } from '@/components/layout/WhatsNewModal';
import {
  useChangelog,
  readLastSeenVersion,
  WHATSNEW_SEEN_EVENT_NAME,
  WHATSNEW_LAST_SEEN_STORAGE_KEY,
} from '@/hooks/useChangelog';
import { useAppVersion } from '@/hooks/useAppVersion';
import { GlassCard } from '@/components/common/GlassCard';
import { IconButton } from '@/components/common/IconButton';
import { Z_INDEX } from '@/config/zIndex';
import { SettingsModal } from '@/components/settingsModal/SettingsModal';
import { BackgroundsModal } from '@/components/backgroundsModal/BackgroundsModal';
import { QuickAccessModal } from '@/components/quickAccessModal/QuickAccessModal';
import { SidebarGoogleDrive } from './SidebarGoogleDrive';
import { SidebarBuildings } from './SidebarBuildings';
import { SidebarClasses } from './SidebarClasses';
import { SidebarPlcs } from './SidebarPlcs';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';

declare const __APP_VERSION__: string;

// Lazy: AdminSettings pulls in recharts + the admin surface (~1.2MB) but only admins open it.
const AdminSettings = React.lazy(() =>
  import('@/components/admin/AdminSettings').then((m) => ({
    default: m.AdminSettings,
  }))
);

type MenuSection = 'main' | 'classes' | 'plcs' | 'google-drive' | 'buildings';

interface PlcsMenuButtonProps {
  onClick: () => void;
  plcCount: number;
  pendingInviteCount: number;
}

const PlcsMenuButton: React.FC<PlcsMenuButtonProps> = ({
  onClick,
  plcCount,
  pendingInviteCount,
}) => {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
    >
      <div className="relative w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
        <Users2 className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
        {pendingInviteCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red-primary border-2 border-white" />
        )}
      </div>
      <span className="flex-grow text-[13px]">
        {t('sidebar.nav.plcs', { defaultValue: 'My PLCs' })}
      </span>
      <span className="text-xxs bg-brand-blue-lighter text-brand-blue-primary px-2 py-0.5 rounded-full font-bold">
        {plcCount}
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
    </button>
  );
};

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>('main');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { user, signOut, isAdmin, appSettings, isExternalUser } = useAuth();
  const {
    dashboards,
    activeDashboard,
    isSaving,
    clearAllWidgets,
    rosters,
    annotationActive,
    openAnnotation,
    closeAnnotation,
    isActiveBoardReadOnly,
  } = useDashboard();

  // Mount the PLC listeners once at the Sidebar level and drill the data into
  // the two consumers (`PlcsMenuButton`, `SidebarPlcs`) that are both always
  // rendered while the sidebar is open. Without this, each consumer calls
  // `usePlcs()` + `usePlcInvitations()` independently, duplicating the three
  // Firestore `onSnapshot` subscriptions (1 from usePlcs, 2 from
  // usePlcInvitations) for data that's semantically a singleton per session.
  //
  // The PLC dashboard is now a first-class route (`/plc/:id/:section`, Decision
  // 0.3) rendered by `PlcRouteHost`, which mounts its OWN `usePlcs` listener —
  // so the sidebar only needs the list while the drawer itself is open.
  //
  // Skip the PLC listeners entirely for external (no-org/free-tier) users: PLCs
  // are an org-only surface that's hidden for them below, so attaching the
  // three Firestore `onSnapshot` subscriptions (1 from usePlcs, 2 from
  // usePlcInvitations) would be pure waste. Gating on `!isExternalUser` (which
  // is false while membership resolves) means org members keep their listeners
  // unchanged.
  const plcsEnabled = isOpen && !isExternalUser;
  const plcsHook = usePlcs({ enabled: plcsEnabled });
  const plcInvitationsHook = usePlcInvitations({ enabled: plcsEnabled });

  const { isConnected: isDriveConnected } = useGoogleDrive();

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err: unknown) => {
        if (err instanceof Error) {
          console.error(
            `Error attempting to enable fullscreen: ${err.message}`
          );
        }
      });
    } else {
      if (document.exitFullscreen) {
        void document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleOpenSidebar = (e: Event) => {
      setIsOpen(true);
      const detail = (e as CustomEvent<{ section?: MenuSection }>).detail;
      if (detail?.section) setActiveSection(detail.section);
    };
    window.addEventListener('open-sidebar', handleOpenSidebar);

    return () => {
      window.removeEventListener('open-sidebar', handleOpenSidebar);
    };
  }, []);

  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShortLinkQuickCreate, setShowShortLinkQuickCreate] =
    useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [lastSeenWhatsNew, setLastSeenWhatsNew] = useState<string | null>(() =>
    readLastSeenVersion()
  );
  const [isBoardsModalOpen, setIsBoardsModalOpen] = useState(false);
  const [isBackgroundsModalOpen, setIsBackgroundsModalOpen] = useState(false);
  const [isQuickAccessModalOpen, setIsQuickAccessModalOpen] = useState(false);
  const { latestVersion } = useChangelog();
  const { updateAvailable, reloadApp } = useAppVersion();
  const hasUnreadWhatsNew =
    latestVersion !== null && latestVersion !== lastSeenWhatsNew;
  const closeWhatsNew = () => {
    setShowWhatsNew(false);
    setLastSeenWhatsNew(readLastSeenVersion());
  };

  // Keep the unread badge in sync when the modal is opened from another
  // entry point (the update toast) in the same tab, and across tabs via
  // the native `storage` event.
  useEffect(() => {
    const onSeen = (e: Event) => {
      const next = (e as CustomEvent<string | null>).detail ?? null;
      setLastSeenWhatsNew(next ?? readLastSeenVersion());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== WHATSNEW_LAST_SEEN_STORAGE_KEY) return;
      setLastSeenWhatsNew(e.newValue);
    };
    window.addEventListener(WHATSNEW_SEEN_EVENT_NAME, onSeen);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WHATSNEW_SEEN_EVENT_NAME, onSeen);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <>
      <GlassCard
        globalStyle={activeDashboard?.globalStyle}
        data-screenshot="exclude"
        className="fixed flex items-center gap-2 p-2 rounded-full"
        style={{
          top: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
          left: 'calc(1.5rem + env(safe-area-inset-left, 0px))',
          // While annotation is active, the AnnotationOverlay's full-viewport
          // canvas sits at Z_INDEX.overlay with pointer-events-auto, which
          // would otherwise swallow clicks on this toolbar (specifically the
          // pencil toggle that's supposed to close annotation). Lift the
          // toolbar above the overlay so the toggle remains reachable.
          zIndex: annotationActive ? Z_INDEX.confirmOverlay : Z_INDEX.dock,
        }}
      >
        <IconButton
          onClick={() => setIsOpen(true)}
          icon={<Menu className="w-5 h-5" />}
          label={t('sidebar.header.openMenu')}
          variant="primary"
          size="md"
          className="shadow-brand-blue-dark/20"
        />

        <div className="h-6 w-px bg-slate-200 mx-1" />

        {isAdmin && (
          <IconButton
            onClick={() => setShowAdminSettings(true)}
            icon={<Settings className="w-5 h-5" />}
            label={t('sidebar.header.adminSettings')}
            variant="brand-ghost"
            size="md"
          />
        )}

        {isAdmin && (
          <IconButton
            onClick={() => setShowShortLinkQuickCreate(true)}
            icon={<Link2 className="w-5 h-5" />}
            label="Shorten URL"
            variant="brand-ghost"
            size="md"
          />
        )}

        <IconButton
          onClick={toggleFullscreen}
          icon={
            isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )
          }
          label={
            isFullscreen
              ? t('sidebar.header.exitFullscreen')
              : t('sidebar.header.enterFullscreen')
          }
          variant="brand-ghost"
          size="md"
        />

        {/* Pencil button is hidden on View-Only shared boards. Viewers
            can't push annotations through the live mirror (the host's
            strokes flow in read-only via the dashboard subscribe path),
            so exposing the toggle would be a dead control. */}
        {!isActiveBoardReadOnly && (
          <IconButton
            onClick={() =>
              annotationActive ? closeAnnotation() : openAnnotation()
            }
            icon={<Pencil className="w-5 h-5" />}
            label={
              annotationActive
                ? t('sidebar.header.stopAnnotating')
                : t('sidebar.header.annotateScreen')
            }
            variant="brand-ghost"
            size="md"
            className={
              annotationActive
                ? '!bg-brand-blue-lighter !text-brand-blue-primary'
                : ''
            }
          />
        )}

        <IconButton
          onClick={async () => {
            const confirmed = await showConfirm(
              t('sidebar.confirmClearBoard'),
              {
                title: 'Clear Board',
                variant: 'danger',
                confirmLabel: 'Clear All',
              }
            );
            if (confirmed) clearAllWidgets();
          }}
          icon={<Trash2 className="w-5 h-5" />}
          label={t('sidebar.header.clearAllWindows')}
          variant="brand-danger-ghost"
          size="md"
        />
      </GlassCard>

      {showAdminSettings && (
        <LazyChunkErrorBoundary>
          <React.Suspense fallback={null}>
            <AdminSettings onClose={() => setShowAdminSettings(false)} />
          </React.Suspense>
        </LazyChunkErrorBoundary>
      )}

      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {showShortLinkQuickCreate && (
        <ShortLinkQuickCreate
          onClose={() => setShowShortLinkQuickCreate(false)}
        />
      )}

      {showWhatsNew && (
        <WhatsNewModal
          isOpen={showWhatsNew}
          onClose={closeWhatsNew}
          mode="browse"
          currentVersion={__APP_VERSION__}
          updateAvailable={updateAvailable}
          onUpdate={reloadApp}
        />
      )}

      {isBoardsModalOpen && (
        <BoardsModal onClose={() => setIsBoardsModalOpen(false)} />
      )}

      {isBackgroundsModalOpen && (
        <BackgroundsModal
          isOpen={isBackgroundsModalOpen}
          onClose={() => setIsBackgroundsModalOpen(false)}
        />
      )}

      {isQuickAccessModalOpen && (
        <QuickAccessModal
          isOpen={isQuickAccessModalOpen}
          onClose={() => setIsQuickAccessModalOpen(false)}
        />
      )}

      {isOpen && (
        <div className="fixed inset-0 z-modal flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setIsOpen(false);
              setActiveSection('main');
            }}
          />
          <div className="relative w-full max-w-80 h-full bg-white shadow-2xl flex flex-col p-0 animate-in slide-in-from-left duration-300 border-r border-slate-200">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0 bg-white z-10">
              <div className="flex items-center gap-3 min-w-0">
                {activeSection !== 'main' ? (
                  <IconButton
                    onClick={() => setActiveSection('main')}
                    icon={<ArrowLeft className="w-5 h-5" />}
                    label={t('sidebar.header.back')}
                    variant="ghost"
                    size="md"
                    shape="square"
                    className="-ml-1.5"
                  />
                ) : (
                  <div className="w-9 h-9 flex-shrink-0 bg-brand-blue-primary rounded-lg flex items-center justify-center overflow-hidden">
                    {appSettings?.logoUrl ? (
                      <img
                        src={appSettings.logoUrl}
                        alt="Custom Logo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <LayoutGrid className="w-5 h-5 text-white" />
                    )}
                  </div>
                )}
                <span className="text-sm font-bold tracking-wider uppercase text-slate-500 truncate">
                  {activeSection === 'main'
                    ? t('sidebar.header.classroomManager')
                    : t(`sidebar.nav.${activeSection}`, {
                        defaultValue: activeSection.replace('-', ' '),
                      })}
                </span>
              </div>
              <IconButton
                onClick={() => {
                  setIsOpen(false);
                  setActiveSection('main');
                }}
                icon={<X className="w-5 h-5" />}
                label={t('sidebar.header.closeMenu')}
                variant="ghost"
                size="md"
              />
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden bg-white">
              {/* MAIN MENU */}
              <nav
                className={`absolute inset-0 pt-3 flex flex-col overflow-y-auto transition-[transform,opacity] duration-300 ease-in-out ${
                  activeSection === 'main'
                    ? 'translate-x-0 opacity-100 visible'
                    : '-translate-x-full opacity-0 invisible'
                }`}
              >
                {/* WORKSPACE Section */}
                <div className="px-5 mb-1.5 mt-1">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.15em]">
                    {t('sidebar.nav.workspace')}
                  </span>
                </div>
                <div className="flex flex-col px-2.5 mb-1">
                  <button
                    onClick={() => {
                      // Skip the intermediate sidebar "boards" panel — its
                      // board list duplicates what the FAB already exposes.
                      // Open the full management modal instead and close
                      // the sidebar so the user lands directly on Boards.
                      setIsBoardsModalOpen(true);
                      setIsOpen(false);
                    }}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <SquareSquare className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('sidebar.nav.boards')}
                    </span>
                    <span className="text-xxs bg-brand-blue-lighter text-brand-blue-primary px-2 py-0.5 rounded-full font-bold">
                      {dashboards.length}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                  <button
                    onClick={() => setIsBackgroundsModalOpen(true)}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-50 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <Paintbrush className="w-4 h-4 text-pink-400 group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('sidebar.nav.backgrounds')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                  {/* Org-only surfaces: My Classes (incl. ClassLink import),
                      My PLCs, and My Building(s). Hidden for external (no-org/
                      free-tier) users — buildings/PLCs/ClassLink are all org
                      concepts. `isExternalUser` is false while membership
                      resolves, so org/internal members never see these flicker
                      off during load. */}
                  {!isExternalUser && (
                    <>
                      <button
                        onClick={() => setActiveSection('classes')}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                          <Users className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
                        </div>
                        <span className="flex-grow text-[13px]">
                          {t('sidebar.nav.classes', {
                            defaultValue: 'My Classes',
                          })}
                        </span>
                        <span className="text-xxs bg-brand-blue-lighter text-brand-blue-primary px-2 py-0.5 rounded-full font-bold">
                          {rosters.length}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                      </button>
                      <PlcsMenuButton
                        onClick={() => setActiveSection('plcs')}
                        plcCount={plcsHook.plcs.length}
                        pendingInviteCount={
                          plcInvitationsHook.pendingInvites.length
                        }
                      />
                      <button
                        onClick={() => setActiveSection('buildings')}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-teal-50 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                          <Building2 className="w-4 h-4 text-teal-400 group-hover:text-brand-blue-primary transition-colors" />
                        </div>
                        <span className="flex-grow text-[13px]">
                          {t('sidebar.nav.buildings', {
                            defaultValue: 'My Building(s)',
                          })}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                      </button>
                    </>
                  )}
                </div>

                <div className="mx-5 my-2.5 border-t border-slate-100" />

                {/* CUSTOMIZE Section */}
                <div className="px-5 mb-1.5">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.15em]">
                    {t('sidebar.nav.configuration', {
                      defaultValue: 'Customize',
                    })}
                  </span>
                </div>
                <div className="flex flex-col px-2.5 mb-1">
                  <button
                    onClick={() => {
                      // Settings is a focused modal with its own rail; close
                      // the drawer so we don't stack modal-over-drawer.
                      setShowSettingsModal(true);
                      setIsOpen(false);
                      setActiveSection('main');
                    }}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <SlidersHorizontal className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('settings.title', { defaultValue: 'Settings' })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                  <button
                    onClick={() => setIsQuickAccessModalOpen(true)}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <Zap className="w-4 h-4 text-amber-400 group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('sidebar.nav.quickAccess', {
                        defaultValue: 'Quick Access',
                      })}
                    </span>
                    <span className="text-xxs bg-amber-50 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                      {activeDashboard?.settings?.quickAccessWidgets?.length ??
                        0}
                      /2
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                </div>

                <div className="mx-5 my-2.5 border-t border-slate-100" />

                {/* ACCOUNT Section */}
                <div className="px-5 mb-1.5">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.15em]">
                    {t('sidebar.nav.account', { defaultValue: 'Account' })}
                  </span>
                </div>
                <div className="flex flex-col px-2.5">
                  {/* Google Drive backup/sync is a Google-API feature excluded
                      from the free tier (docs/wide-distro-plan.md Phase 3:
                      "excludes all Google-API features"). Hide the entry for
                      external (no-org/free-tier) users so they never connect
                      Drive — keeping their boards Firestore-only and the Sheets
                      export inert. `isExternalUser` is false while membership
                      resolves, so org/internal members are unaffected. */}
                  {!isExternalUser && (
                    <button
                      onClick={() => setActiveSection('google-drive')}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                        <GoogleDriveIcon className="w-4 h-4" />
                      </div>
                      <span className="flex-grow text-[13px]">
                        {t('sidebar.nav.googleDrive', {
                          defaultValue: 'Google Drive',
                        })}
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${isDriveConnected ? 'bg-emerald-500' : 'bg-amber-400'}`}
                      />
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                    </button>
                  )}
                  {/* "What's New" / announcements: org-only surface, hidden for
                      external (no-org/free-tier) users along with the other org
                      menu items. `isExternalUser` is false during the
                      membership-loading window, so org members never see it
                      flicker off. */}
                  {!isExternalUser && (
                    <button
                      onClick={() => setShowWhatsNew(true)}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                    >
                      <div className="relative w-8 h-8 rounded-lg bg-emerald-50 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-emerald-500 group-hover:text-brand-blue-primary transition-colors" />
                        {hasUnreadWhatsNew && (
                          <span
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red-primary border-2 border-white"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <span className="flex-grow text-[13px]">
                        {t('sidebar.nav.whatsNew', {
                          defaultValue: "What's New",
                        })}
                      </span>
                      {hasUnreadWhatsNew && (
                        <>
                          <span className="sr-only">
                            {t('sidebar.nav.whatsNewSrAnnouncement', {
                              defaultValue: 'New release notes available',
                            })}
                          </span>
                          <span
                            className="text-xxs font-bold text-brand-red-primary group-hover:text-brand-red-dark uppercase tracking-wide transition-colors"
                            aria-hidden="true"
                          >
                            {t('sidebar.nav.whatsNewBadge', {
                              defaultValue: 'New',
                            })}
                          </span>
                        </>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                    </button>
                  )}
                </div>
              </nav>

              {/* Org-only section panels (Classes / PLCs / Buildings). Not
                  rendered for external (no-org/free-tier) users — their menu
                  buttons are hidden above, so the panels are unreachable, but
                  skipping them entirely is defense-in-depth (and avoids passing
                  the disabled PLC hook's empty data into SidebarPlcs).
                  `isExternalUser` is false while membership resolves. */}
              {!isExternalUser && (
                <>
                  {/* CLASSES SECTION */}
                  <SidebarClasses isVisible={activeSection === 'classes'} />

                  {/* PLCS SECTION */}
                  <SidebarPlcs
                    isVisible={activeSection === 'plcs'}
                    plcs={plcsHook.plcs}
                    plcsLoading={plcsHook.loading}
                    createPlc={plcsHook.createPlc}
                    leavePlc={plcsHook.leavePlc}
                    deletePlc={plcsHook.deletePlc}
                    pendingInvites={plcInvitationsHook.pendingInvites}
                    onOpenDashboard={(plcId) => {
                      // Navigate to the first-class PLC route (Decision 0.3)
                      // instead of opening an overlay. Close the drawer + reset
                      // the section so returning to the board lands on the main
                      // menu.
                      setIsOpen(false);
                      setActiveSection('main');
                      spaNavigate(buildPlcPath(plcId));
                    }}
                  />

                  {/* MY BUILDING(S) SECTION */}
                  <SidebarBuildings isVisible={activeSection === 'buildings'} />
                </>
              )}

              {/* STYLE / LANGUAGE / PREFERENCES — now consolidated into the
                  SettingsModal (opened from the "Settings" entry above). */}

              {/* GOOGLE DRIVE SECTION */}
              {!isExternalUser && (
                <SidebarGoogleDrive
                  isVisible={activeSection === 'google-drive'}
                />
              )}
            </div>

            {/* Footer */}
            <footer className="mt-auto border-t border-slate-200 bg-slate-50/50">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user?.displayName ?? ''}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 shadow-sm"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand-blue-primary flex items-center justify-center text-xxs font-bold text-white shadow-sm">
                      {user?.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                </div>
                <div className="flex flex-col min-w-0 flex-grow">
                  <span className="text-xxs font-bold text-slate-900 truncate">
                    {user?.displayName}
                  </span>
                  <span className="text-xxs text-slate-500 truncate">
                    {user?.email}
                  </span>
                </div>

                <div className="flex items-center gap-2 mr-1">
                  {/* Sync Status */}
                  <div
                    className={`transition-colors duration-500 ${
                      isSaving ? 'text-amber-500' : 'text-emerald-500'
                    }`}
                    title={
                      isSaving
                        ? t('sidebar.header.syncingChanges')
                        : t('sidebar.header.allChangesSavedTooltip')
                    }
                  >
                    {isSaving ? (
                      <Cloud className="w-4 h-4 animate-pulse" />
                    ) : (
                      <CloudCheck className="w-4 h-4" />
                    )}
                  </div>

                  {/* Drive Status */}
                  <div className="relative">
                    <div
                      className={`transition-[filter,opacity] duration-500 ${
                        isDriveConnected ? '' : 'grayscale opacity-30'
                      }`}
                      title={
                        isDriveConnected
                          ? t('sidebar.header.googleDriveConnected')
                          : t('sidebar.header.googleDriveDisconnected')
                      }
                    >
                      <GoogleDriveIcon className="w-4 h-4" />
                    </div>
                    {!isDriveConnected && (
                      <div className="absolute -top-1 -right-1 bg-white rounded-full">
                        <AlertCircle className="w-2.5 h-2.5 text-brand-red-primary fill-white" />
                      </div>
                    )}
                  </div>
                </div>

                <IconButton
                  onClick={() => void signOut()}
                  icon={<LogOut className="w-4 h-4" />}
                  label={t('sidebar.header.signOut')}
                  variant="ghost"
                  size="sm"
                />
              </div>
              <div className="px-4 pb-3 flex justify-between items-center">
                <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.2em]">
                  v2.0.4-stable
                </span>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
