import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Film,
  LayoutDashboard,
  ListChecks,
  Settings as SettingsIcon,
  SquareSquare,
  StickyNote,
  Users2,
  type LucideIcon,
} from 'lucide-react';

import { Plc, PlcFeatureSettings, getPlcFeatures } from '@/types';
import { useAuth } from '@/context/useAuth';
import { PlcOverviewTab } from './tabs/PlcOverviewTab';
import { PlcCompletedAssignmentsTab } from './tabs/PlcCompletedAssignmentsTab';
import { PlcSettingsTab } from './tabs/PlcSettingsTab';
import { PlcNotesTab } from './tabs/PlcNotesTab';
import { PlcTodosTab } from './tabs/PlcTodosTab';
import { PlcPlaceholderTab } from './tabs/PlcPlaceholderTab';

interface PlcDashboardProps {
  plc: Plc;
  onClose: () => void;
}

export type PlcDashboardTabId =
  | 'overview'
  | 'completed'
  | 'quizzes'
  | 'assignments'
  | 'videoActivities'
  | 'notes'
  | 'todos'
  | 'sharedBoards'
  | 'settings';

interface TabDef {
  id: PlcDashboardTabId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
  /**
   * Feature flag key gating this tab; absent means the tab is always
   * visible (Overview, Completed Assignments, Settings).
   */
  feature?: keyof PlcFeatureSettings;
  /** Phase 1 placeholder copy for tabs not yet implemented. */
  placeholder?: { titleDefault: string; descriptionDefault: string };
}

const TABS: readonly TabDef[] = [
  {
    id: 'overview',
    icon: LayoutDashboard,
    labelKey: 'plcDashboard.tabs.overview',
    labelDefault: 'Overview',
  },
  {
    id: 'completed',
    icon: ClipboardList,
    labelKey: 'plcDashboard.tabs.completed',
    labelDefault: 'Completed Assignments',
  },
  {
    id: 'quizzes',
    icon: BookOpen,
    labelKey: 'plcDashboard.tabs.quizzes',
    labelDefault: 'Quiz Library',
    feature: 'quizzes',
    placeholder: {
      titleDefault: 'PLC Quiz Library',
      descriptionDefault:
        'Share quizzes with the PLC, edit collaboratively, and let teammates sync or copy them into their own libraries.',
    },
  },
  {
    id: 'assignments',
    icon: ClipboardList,
    labelKey: 'plcDashboard.tabs.assignments',
    labelDefault: 'PLC Assignments',
    feature: 'assignments',
    placeholder: {
      titleDefault: 'PLC Assignments',
      descriptionDefault:
        'Author PLC-level assignments here so teammates can pick them up on their own boards.',
    },
  },
  {
    id: 'videoActivities',
    icon: Film,
    labelKey: 'plcDashboard.tabs.videoActivities',
    labelDefault: 'Video Activities',
    feature: 'videoActivities',
    placeholder: {
      titleDefault: 'PLC Video Activities',
      descriptionDefault:
        'Share video-based activities with your PLC and aggregate completion data alongside quizzes.',
    },
  },
  {
    id: 'notes',
    icon: StickyNote,
    labelKey: 'plcDashboard.tabs.notes',
    labelDefault: 'Notes',
    feature: 'notes',
  },
  {
    id: 'todos',
    icon: ListChecks,
    labelKey: 'plcDashboard.tabs.todos',
    labelDefault: 'To-Do List',
    feature: 'todos',
  },
  {
    id: 'sharedBoards',
    icon: SquareSquare,
    labelKey: 'plcDashboard.tabs.sharedBoards',
    labelDefault: 'Shared Boards',
    feature: 'sharedBoards',
    placeholder: {
      titleDefault: 'Shared Boards',
      descriptionDefault: 'Dashboards shared with this PLC will surface here.',
    },
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    labelKey: 'plcDashboard.tabs.settings',
    labelDefault: 'Settings',
  },
] as const;

/**
 * Full-screen PLC Dashboard view. Opens when a member clicks a PLC in the
 * sidebar list. Mirrors `AdminSettings`'s overlay pattern — a fixed-position
 * dialog that takes the full viewport, with a desktop tab rail and a
 * mobile drawer.
 */
export const PlcDashboard: React.FC<PlcDashboardProps> = ({ plc, onClose }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PlcDashboardTabId>('overview');
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  // Close on Escape — same UX contract as AdminSettings.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const features = useMemo(() => getPlcFeatures(plc), [plc]);
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !tab.feature || features[tab.feature]),
    [features]
  );

  // If the active tab gets hidden via a settings toggle by another member,
  // fall back to "Overview" — which is always visible. Adjust state during
  // render rather than via an effect to avoid an extra render pass; the
  // setter is a no-op when the value is already 'overview'.
  if (!visibleTabs.find((tab) => tab.id === activeTab)) {
    setActiveTab('overview');
  }

  const activeTabDef = visibleTabs.find((tab) => tab.id === activeTab);
  const isLead = plc.leadUid === user?.uid;

  const handleBackOrClose = () => {
    if (!showMobileMenu) {
      setShowMobileMenu(true);
    } else {
      onClose();
    }
  };

  // Tile click handler — overview tiles call this to drill into a tab.
  // On mobile the drawer is currently open (because the user just
  // navigated from the menu); auto-collapse it so the tab content
  // becomes visible without an extra tap.
  const handleNavigateTab = useCallback((tabId: PlcDashboardTabId) => {
    setActiveTab(tabId);
    setShowMobileMenu(false);
  }, []);

  const renderTabContent = (tab: TabDef) => {
    if (tab.id === 'overview') {
      return <PlcOverviewTab plc={plc} onNavigateTab={handleNavigateTab} />;
    }
    if (tab.id === 'completed') {
      return <PlcCompletedAssignmentsTab plc={plc} />;
    }
    if (tab.id === 'notes') {
      return <PlcNotesTab plc={plc} />;
    }
    if (tab.id === 'todos') {
      return <PlcTodosTab plc={plc} />;
    }
    if (tab.id === 'settings') {
      return <PlcSettingsTab plc={plc} />;
    }
    if (tab.placeholder) {
      return (
        <PlcPlaceholderTab
          icon={tab.icon}
          title={t(`${tab.labelKey}.placeholderTitle`, {
            defaultValue: tab.placeholder.titleDefault,
          })}
          description={t(`${tab.labelKey}.placeholderDescription`, {
            defaultValue: tab.placeholder.descriptionDefault,
          })}
        />
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plc-dashboard-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2 overflow-hidden w-full md:w-auto">
            <button
              onClick={handleBackOrClose}
              className="p-2 md:p-1.5 hover:bg-white/20 rounded-lg transition-colors shrink-0 -ml-2 md:ml-0"
              aria-label={
                !showMobileMenu
                  ? t('plcDashboard.backToMenu', { defaultValue: 'Back' })
                  : t('plcDashboard.close', { defaultValue: 'Close' })
              }
            >
              <ChevronLeft className="w-6 h-6 md:w-5 md:h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Users2 className="w-5 h-5 md:w-4 md:h-4 text-white/70 shrink-0 hidden md:block" />
              <div className="flex flex-col md:flex-row md:items-baseline md:gap-2 min-w-0">
                <h2
                  id="plc-dashboard-title"
                  className="text-base md:text-lg font-bold truncate"
                >
                  {plc.name}
                </h2>
                <span className="hidden md:inline text-xxs uppercase tracking-widest text-white/60">
                  {t('plcDashboard.subtitle', {
                    defaultValue: 'PLC Dashboard',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Tab pills (desktop only) + meta */}
          <div className="hidden md:flex items-center gap-3 ml-4">
            <div className="flex gap-1" role="tablist">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-full font-bold text-xxs uppercase tracking-wide flex items-center gap-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-brand-blue-dark shadow-sm'
                      : 'text-white/80 hover:bg-white/20 hover:text-white'
                  }`}
                  title={t(tab.labelKey, { defaultValue: tab.labelDefault })}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">
                    {t(tab.labelKey, { defaultValue: tab.labelDefault })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sub-header: PLC meta */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 flex items-center gap-3 text-xxs text-slate-500 shrink-0">
          <span className="font-semibold uppercase tracking-widest">
            {t('plcDashboard.meta.members', {
              count: plc.memberUids.length,
              defaultValue: '{{count}} Member',
              defaultValue_other: '{{count}} Members',
            })}
          </span>
          {isLead && (
            <>
              <span className="text-slate-300">•</span>
              <span className="font-semibold uppercase tracking-widest text-brand-blue-primary">
                {t('plcDashboard.meta.youLead', {
                  defaultValue: 'You lead this PLC',
                })}
              </span>
            </>
          )}
          {!showMobileMenu && activeTabDef && (
            <>
              <span className="text-slate-300 md:hidden">•</span>
              <span className="md:hidden font-semibold text-slate-700 truncate">
                {t(activeTabDef.labelKey, {
                  defaultValue: activeTabDef.labelDefault,
                })}
              </span>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-none touch-pan-y bg-slate-50">
          {/* Mobile menu */}
          <div className={`md:hidden ${showMobileMenu ? 'block' : 'hidden'}`}>
            <div className="flex flex-col py-2">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setShowMobileMenu(false);
                  }}
                  className="flex items-center justify-between p-4 min-h-[60px] hover:bg-slate-100 active:bg-slate-200 transition-colors border-b border-slate-100 last:border-b-0 w-full text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600">
                      <tab.icon className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-slate-700 text-base">
                      {t(tab.labelKey, { defaultValue: tab.labelDefault })}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              ))}
            </div>
          </div>

          {/* Active panel */}
          <div
            className={`${
              !showMobileMenu ? 'block' : 'hidden md:block'
            } p-4 md:p-6 h-full`}
          >
            {activeTabDef && (
              <div
                key={activeTabDef.id}
                role="tabpanel"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                {renderTabContent(activeTabDef)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
