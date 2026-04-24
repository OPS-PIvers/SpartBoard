import React, { useState, useRef, useEffect } from 'react';
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
  Star,
  Maximize,
  Minimize,
  ArrowLeft,
  Palette,
  Trash2,
  Cloud,
  CloudCheck,
  AlertCircle,
  Zap,
  Globe,
  Building2,
  SlidersHorizontal,
  Users,
  Users2,
} from 'lucide-react';
import { GoogleDriveIcon } from '@/components/common/GoogleDriveIcon';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { GlassCard } from '@/components/common/GlassCard';
import { IconButton } from '@/components/common/IconButton';
import { StylePanel } from './StylePanel';
import { SidebarBoards } from './SidebarBoards';
import { SidebarBackgrounds } from './SidebarBackgrounds';
import { SidebarQuickAccess } from './SidebarQuickAccess';
import { SidebarGoogleDrive } from './SidebarGoogleDrive';
import { SidebarLanguageRegion } from './SidebarLanguageRegion';
import { SidebarBuildings } from './SidebarBuildings';
import { SidebarPreferences } from './SidebarPreferences';
import { SidebarClasses } from './SidebarClasses';
import { SidebarPlcs } from './SidebarPlcs';
import { usePlcs } from '@/hooks/usePlcs';
import { usePlcInvitations } from '@/hooks/usePlcInvitations';

const isPlcsEnabled = import.meta.env.VITE_ENABLE_PLCS === 'true';

type MenuSection =
  | 'main'
  | 'boards'
  | 'backgrounds'
  | 'classes'
  | 'plcs'
  | 'style'
  | 'quick-access'
  | 'google-drive'
  | 'language'
  | 'buildings'
  | 'preferences';

/**
 * Menu entry for "My PLCs". Lives in a subcomponent so `usePlcs` /
 * `usePlcInvitations` only spin up their Firestore listeners when the PLC
 * feature flag is actually on.
 */
const PlcsMenuButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation();
  const { plcs } = usePlcs();
  const { pendingInvites } = usePlcInvitations();
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
    >
      <div className="relative w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
        <Users2 className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
        {pendingInvites.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red-primary border-2 border-white" />
        )}
      </div>
      <span className="flex-grow text-[13px]">
        {t('sidebar.nav.plcs', { defaultValue: 'My PLCs' })}
      </span>
      <span className="text-xxs bg-brand-blue-lighter text-brand-blue-primary px-2 py-0.5 rounded-full font-bold">
        {plcs.length}
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

  const { user, signOut, isAdmin, appSettings } = useAuth();
  const {
    dashboards,
    activeDashboard,
    isSaving,
    loadDashboard,
    clearAllWidgets,
    setGlobalStyle,
    addToast,
    rosters,
  } = useDashboard();

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

  const [isBoardSwitcherExpanded, setIsBoardSwitcherExpanded] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    if (isBoardSwitcherExpanded) {
      // Small delay to allow transition to finish
      const timer = setTimeout(checkScroll, 500);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [isBoardSwitcherExpanded, dashboards]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        isBoardSwitcherExpanded &&
        toolbarRef.current &&
        !toolbarRef.current.contains(event.target as Node)
      ) {
        setIsBoardSwitcherExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isBoardSwitcherExpanded]);

  const [showAdminSettings, setShowAdminSettings] = useState(false);

  return (
    <>
      <GlassCard
        ref={toolbarRef}
        globalStyle={activeDashboard?.globalStyle}
        data-screenshot="exclude"
        className="fixed z-dock flex items-center gap-2 p-2 rounded-full"
        style={{
          top: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
          left: 'calc(1.5rem + env(safe-area-inset-left, 0px))',
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

        <IconButton
          onClick={() => setIsBoardSwitcherExpanded(!isBoardSwitcherExpanded)}
          icon={<ChevronRight className="w-5 h-5" />}
          label={
            isBoardSwitcherExpanded
              ? t('sidebar.header.hideBoards')
              : t('sidebar.header.switchBoards')
          }
          variant={isBoardSwitcherExpanded ? 'primary' : 'brand-ghost'}
          size="md"
          className={`[&>svg]:transition-transform [&>svg]:duration-500 ${
            isBoardSwitcherExpanded ? '[&>svg]:rotate-180' : '[&>svg]:rotate-0'
          }`}
        />

        {/* Board Switcher Sliding Toggle Bar */}
        <div
          className={`overflow-hidden transition-[max-width,opacity] duration-500 ease-in-out flex items-center gap-1 ${
            isBoardSwitcherExpanded
              ? 'max-w-[80vw] ml-2 opacity-100'
              : 'max-w-0 ml-0 opacity-0'
          }`}
        >
          <div className="h-6 w-px bg-slate-200 mx-1 flex-shrink-0" />
          <div className="relative flex items-center min-w-0">
            <div
              ref={scrollContainerRef}
              onScroll={checkScroll}
              className="flex bg-slate-100/80 p-1 rounded-full border border-slate-200/50 backdrop-blur-sm overflow-x-auto no-scrollbar scroll-smooth"
            >
              <div className="flex gap-1">
                {dashboards.map((db) => (
                  <button
                    key={db.id}
                    onClick={() => {
                      loadDashboard(db.id);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-[color,background-color,box-shadow] flex items-center gap-2 whitespace-nowrap ${
                      activeDashboard?.id === db.id
                        ? 'bg-brand-blue-primary text-white shadow-md'
                        : 'text-slate-500 hover:bg-slate-200/50'
                    }`}
                  >
                    {db.isDefault && (
                      <Star
                        className={`w-3 h-3 ${
                          activeDashboard?.id === db.id
                            ? 'fill-white text-white'
                            : 'fill-amber-400 text-amber-400'
                        }`}
                      />
                    )}
                    {db.name}
                  </button>
                ))}
              </div>
            </div>
            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1 pointer-events-none">
                <div className="bg-gradient-to-l from-slate-100 to-transparent w-8 h-full rounded-r-full flex items-center justify-end">
                  <ChevronRight className="w-3 h-3 text-slate-400 animate-pulse mr-1" />
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {showAdminSettings && (
        <AdminSettings onClose={() => setShowAdminSettings(false)} />
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
                    onClick={() => setActiveSection('boards')}
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
                    onClick={() => setActiveSection('backgrounds')}
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
                  {isPlcsEnabled && (
                    <PlcsMenuButton onClick={() => setActiveSection('plcs')} />
                  )}
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
                    onClick={() => setActiveSection('style')}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <Palette className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('sidebar.nav.globalStyle')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                  <button
                    onClick={() => setActiveSection('quick-access')}
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
                  <button
                    onClick={() => setActiveSection('language')}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-50 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <Globe className="w-4 h-4 text-violet-400 group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('sidebar.nav.languageRegion', {
                        defaultValue: 'Language & Region',
                      })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                  <button
                    onClick={() => setActiveSection('preferences')}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors flex-shrink-0">
                      <SlidersHorizontal className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-colors" />
                    </div>
                    <span className="flex-grow text-[13px]">
                      {t('sidebar.nav.preferences', {
                        defaultValue: 'Preferences',
                      })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
                  </button>
                </div>
              </nav>

              {/* BOARDS SECTION */}
              <SidebarBoards isVisible={activeSection === 'boards'} />

              {/* BACKGROUNDS SECTION */}
              <SidebarBackgrounds isVisible={activeSection === 'backgrounds'} />

              {/* CLASSES SECTION */}
              <SidebarClasses isVisible={activeSection === 'classes'} />

              {/* PLCS SECTION */}
              {isPlcsEnabled && (
                <SidebarPlcs isVisible={activeSection === 'plcs'} />
              )}

              {/* STYLE SECTION */}
              <StylePanel
                isVisible={activeSection === 'style'}
                activeDashboard={activeDashboard}
                setGlobalStyle={setGlobalStyle}
                addToast={addToast}
              />

              {/* QUICK ACCESS SECTION */}
              <SidebarQuickAccess
                isVisible={activeSection === 'quick-access'}
              />

              {/* GOOGLE DRIVE SECTION */}
              <SidebarGoogleDrive
                isVisible={activeSection === 'google-drive'}
              />

              {/* LANGUAGE & REGION SECTION */}
              <SidebarLanguageRegion isVisible={activeSection === 'language'} />

              {/* MY BUILDING(S) SECTION */}
              <SidebarBuildings isVisible={activeSection === 'buildings'} />

              {/* PREFERENCES SECTION */}
              <SidebarPreferences isVisible={activeSection === 'preferences'} />
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
