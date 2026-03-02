import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { SidebarWidgets } from './SidebarWidgets';
import { SidebarSettings } from './SidebarSettings';

type MenuSection =
  | 'main'
  | 'boards'
  | 'backgrounds'
  | 'widgets'
  | 'style'
  | 'settings';

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>('main');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { user, signOut, isAdmin } = useAuth();
  const {
    dashboards,
    activeDashboard,
    isSaving,
    loadDashboard,
    clearAllWidgets,
    setGlobalStyle,
    addToast,
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

  const [isBoardSwitcherExpanded, setIsBoardSwitcherExpanded] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const [showAdminSettings, setShowAdminSettings] = useState(false);

  return (
    <>
      <GlassCard
        globalStyle={activeDashboard?.globalStyle}
        data-screenshot="exclude"
        className="fixed top-6 left-6 z-dock flex items-center gap-2 p-2 rounded-full transition-all"
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
          onClick={() => {
            if (window.confirm(t('sidebar.confirmClearBoard'))) {
              clearAllWidgets();
            }
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
          className={`transition-all duration-300 [&>svg]:transition-transform [&>svg]:duration-500 ${
            isBoardSwitcherExpanded ? '[&>svg]:rotate-180' : '[&>svg]:rotate-0'
          }`}
        />

        {/* Board Switcher Sliding Toggle Bar */}
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out flex items-center gap-1 ${
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
                    className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap ${
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
          <div className="relative w-full max-w-72 h-full bg-white shadow-2xl flex flex-col p-0 animate-in slide-in-from-left duration-300 border-r border-slate-200">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 shrink-0 bg-white z-10">
              <div className="flex items-center gap-2">
                {activeSection !== 'main' ? (
                  <IconButton
                    onClick={() => setActiveSection('main')}
                    icon={<ArrowLeft className="w-4 h-4" />}
                    label={t('sidebar.header.back')}
                    variant="ghost"
                    size="sm"
                    shape="square"
                    className="-ml-1.5"
                  />
                ) : (
                  <div className="w-6 h-6 bg-brand-blue-primary rounded flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4 text-white" />
                  </div>
                )}
                <span className="text-xxs font-bold tracking-wider uppercase text-slate-500">
                  {activeSection === 'main'
                    ? t('sidebar.header.classroomManager')
                    : t(`sidebar.nav.${activeSection}`, {
                        defaultValue: activeSection.replace('-', ' '),
                      })}
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all duration-500 ${
                      isSaving
                        ? 'bg-amber-50 text-amber-600 animate-pulse'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                    title={
                      isSaving
                        ? t('sidebar.header.savingToCloud')
                        : t('sidebar.header.allChangesSaved')
                    }
                  >
                    {isSaving ? (
                      <Cloud className="w-3 h-3 animate-bounce" />
                    ) : (
                      <CloudCheck className="w-3 h-3" />
                    )}
                    <span className="text-xxxs font-black uppercase tracking-tighter">
                      {isSaving
                        ? t('sidebar.header.syncing')
                        : t('sidebar.header.cloud')}
                    </span>
                  </div>

                  {isDriveConnected && (
                    <div
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all duration-500 bg-blue-50 text-blue-600"
                      title={t('sidebar.header.googleDriveConnected')}
                    >
                      <GoogleDriveIcon className="w-3 h-3" />
                      <span className="text-xxxs font-black uppercase tracking-tighter">
                        {t('sidebar.header.drive')}
                      </span>
                    </div>
                  )}
                </div>
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
                className={`absolute inset-0 pt-4 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out ${
                  activeSection === 'main'
                    ? 'translate-x-0 opacity-100 visible'
                    : '-translate-x-full opacity-0 invisible'
                }`}
              >
                <div className="px-3 mb-2">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.1em] px-3">
                    {t('sidebar.nav.workspace')}
                  </span>
                </div>
                <div className="flex flex-col">
                  <button
                    onClick={() => setActiveSection('boards')}
                    className="group flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors text-left"
                  >
                    <SquareSquare className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-colors" />
                    <span className="flex-grow">{t('sidebar.nav.boards')}</span>
                    <span className="text-xxs bg-brand-blue-lighter text-brand-blue-primary px-1.5 py-0.5 rounded font-bold">
                      {dashboards.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveSection('backgrounds')}
                    className="group flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors text-left"
                  >
                    <Paintbrush className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-colors" />
                    <span>{t('sidebar.nav.backgrounds')}</span>
                  </button>
                  <button
                    onClick={() => setActiveSection('widgets')}
                    className="group flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors text-left"
                  >
                    <LayoutGrid className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-colors" />
                    <span>{t('sidebar.nav.widgets')}</span>
                  </button>
                </div>

                <div className="my-4 border-t border-slate-100"></div>

                <div className="px-3 mb-2">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-[0.1em] px-3">
                    {t('sidebar.nav.configuration')}
                  </span>
                </div>
                <div className="flex flex-col">
                  <button
                    onClick={() => setActiveSection('style')}
                    className="group flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors text-left"
                  >
                    <Palette className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-colors" />
                    <span>{t('sidebar.nav.globalStyle')}</span>
                  </button>
                  <button
                    onClick={() => setActiveSection('settings')}
                    className="group flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-colors" />
                    <span>{t('sidebar.nav.generalSettings')}</span>
                  </button>
                </div>
              </nav>

              {/* BOARDS SECTION */}
              <SidebarBoards isVisible={activeSection === 'boards'} />

              {/* BACKGROUNDS SECTION */}
              <SidebarBackgrounds isVisible={activeSection === 'backgrounds'} />

              {/* WIDGETS SECTION */}
              <SidebarWidgets isVisible={activeSection === 'widgets'} />

              {/* STYLE SECTION */}
              <StylePanel
                isVisible={activeSection === 'style'}
                activeDashboard={activeDashboard}
                setGlobalStyle={setGlobalStyle}
                addToast={addToast}
              />

              {/* SETTINGS SECTION */}
              <SidebarSettings
                isVisible={activeSection === 'settings'}
                onCancel={() => setActiveSection('main')}
              />
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
                    className={`transition-all duration-500 ${
                      isSaving ? 'text-amber-500' : 'text-emerald-500'
                    }`}
                    title={
                      isSaving
                        ? t('sidebar.header.syncingChanges')
                        : t('sidebar.header.allChangesSavedTooltip')
                    }
                  >
                    {isSaving ? (
                      <Cloud className="w-4 h-4 animate-bounce" />
                    ) : (
                      <CloudCheck className="w-4 h-4" />
                    )}
                  </div>

                  {/* Drive Status */}
                  <div className="relative">
                    <div
                      className={`transition-all duration-500 ${
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
