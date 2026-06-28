import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Image as ImageIcon,
  Zap,
  Bell,
  ChevronLeft,
  ChevronRight,
  Building2,
  BarChart,
  LayoutTemplate,
  Link2,
  GraduationCap,
  Sparkles,
  X,
} from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { FeaturePermissionsManager } from './FeaturePermissionsManager';
import { BackgroundManager } from './BackgroundManager';
import { GlobalPermissionsManager } from './GlobalPermissionsManager';
import { AnnouncementsManager } from './Announcements';
import { OrganizationPanel } from './Organization/OrganizationPanel';
import { AnalyticsManager } from './Analytics/AnalyticsManager';
import { DashboardTemplatesManager } from './DashboardTemplatesManager';
import { LinkShortenerManager } from './LinkShortenerManager';
import { PresetSubEmailsManager } from './PresetSubEmailsManager';
import { PlcResourcesManager } from './PlcResourcesManager/PlcResourcesManager';

interface AdminSettingsProps {
  onClose: () => void;
}

// Tabs are grouped into labelled sections so the vertical rail reads as
// organized clusters rather than nine flat entries. The flat `TABS` list
// (derived below) still drives panel rendering and the active-tab state.
const TAB_GROUPS = [
  {
    id: 'access',
    label: 'Access',
    tabs: [
      {
        id: 'features',
        label: 'Feature Permissions',
        icon: Shield,
        component: FeaturePermissionsManager,
      },
      {
        id: 'global',
        label: 'Global Settings',
        icon: Zap,
        component: GlobalPermissionsManager,
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    tabs: [
      {
        id: 'backgrounds',
        label: 'Background Manager',
        icon: ImageIcon,
        component: BackgroundManager,
      },
      {
        id: 'announcements',
        label: 'Announcements',
        icon: Bell,
        component: AnnouncementsManager,
      },
      {
        id: 'templates',
        label: 'Templates',
        icon: LayoutTemplate,
        component: DashboardTemplatesManager,
      },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    tabs: [
      {
        id: 'organization',
        label: 'Organization',
        icon: Building2,
        component: OrganizationPanel,
      },
      {
        id: 'sub-presets',
        label: 'Sub Presets',
        icon: GraduationCap,
        component: PresetSubEmailsManager,
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: BarChart,
        component: AnalyticsManager,
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    tabs: [
      {
        id: 'links',
        label: 'Links',
        icon: Link2,
        component: LinkShortenerManager,
      },
    ],
  },
  {
    id: 'plc',
    label: 'PLC',
    tabs: [
      {
        id: 'plc-resources',
        label: 'PLC Resources',
        icon: Sparkles,
        component: PlcResourcesManager,
      },
    ],
  },
] as const;

type TabId = (typeof TAB_GROUPS)[number]['tabs'][number]['id'];

interface TabConfig {
  id: TabId;
  label: string;
  icon: typeof Shield;
  component: React.FC;
}

const TABS: readonly TabConfig[] = TAB_GROUPS.flatMap<TabConfig>(
  (group) => group.tabs
);

// One nav entry in the dark vertical rail (desktop). Collapses to icon-only
// when the rail is narrow (md → lg): the label is hidden and the icon centers,
// with `title` carrying the accessible name via tooltip.
const RailTab: React.FC<{
  id: TabId;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ id, isActive, onClick, icon, label }) => (
  <button
    id={`tab-${id}`}
    role="tab"
    aria-selected={isActive}
    aria-controls={`panel-${id}`}
    tabIndex={isActive ? 0 : -1}
    onClick={onClick}
    title={label}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors justify-center lg:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
      isActive
        ? 'bg-white text-brand-blue-dark font-semibold shadow-sm'
        : 'text-white/70 hover:bg-white/10 hover:text-white'
    }`}
  >
    {icon}
    <span className="hidden lg:inline truncate">{label}</span>
  </button>
);

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onClose }) => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('features');
  // Mobile only: the drill-in list (true) vs. the selected panel (false).
  // The desktop rail is always visible, so this flag is inert there.
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  // Close modal on Escape key press. Guard: if Escape originates from an input
  // inside a DraggableWindow and reaches this listener (e.g. the widget's own
  // handler stopped React propagation before DraggableWindow could call
  // stopImmediatePropagation), don't close — the user was cancelling an inline
  // edit, not dismissing this panel.
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const t = event.target;
      if (
        t instanceof Element &&
        !!t.closest('[data-draggable-window]') &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          (t as HTMLElement).isContentEditable)
      )
        return;
      onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!isAdmin) {
    return null;
  }

  const activeTabConfig = TABS.find((t) => t.id === activeTab);
  const mobileTitle =
    !showMobileMenu && activeTabConfig
      ? activeTabConfig.label
      : 'Admin Settings';

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-settings-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* Header — title + close only (tabs now live in the left rail) */}
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            {/* Mobile back button — only while a panel is drilled into */}
            {!showMobileMenu && (
              <button
                onClick={() => setShowMobileMenu(true)}
                className="md:hidden p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 -ml-2"
                aria-label="Back to menu"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <Settings className="w-4 h-4 text-white/70 shrink-0 hidden md:block" />
            <h2
              id="admin-settings-title"
              className="text-lg font-bold truncate"
            >
              <span className="md:hidden">{mobileTitle}</span>
              <span className="hidden md:inline">Admin Settings</span>
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 md:p-1.5 hover:bg-white/20 rounded-lg transition-colors shrink-0 -mr-2 md:mr-0"
            aria-label="Close settings"
          >
            <X className="w-6 h-6 md:w-5 md:h-5" />
          </button>
        </div>

        {/* Body — dark rail (desktop) + light content panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Vertical rail (desktop/tablet): icon+label at lg, icon-only at md */}
          <nav
            role="tablist"
            aria-orientation="vertical"
            aria-label="Admin sections"
            className="hidden md:flex flex-col md:w-[76px] lg:w-60 shrink-0 bg-brand-blue-dark overflow-y-auto py-2"
          >
            {TAB_GROUPS.map((group) => (
              <div key={group.id} className="mb-1">
                <div className="px-4 pt-3 pb-1">
                  <span className="hidden lg:block text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                    {group.label}
                  </span>
                  {/* Icon-only mode: a hairline keeps groups visually distinct */}
                  <div className="lg:hidden mx-auto w-7 border-t border-white/10" />
                </div>
                <div className="flex flex-col gap-0.5 px-2">
                  {group.tabs.map((tab) => (
                    <RailTab
                      key={tab.id}
                      id={tab.id}
                      isActive={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      icon={<tab.icon className="w-5 h-5 shrink-0" />}
                      label={tab.label}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Content column */}
          <div className="flex-1 min-w-0 overflow-y-auto overscroll-none touch-pan-y bg-slate-50">
            {/* Mobile drill-in menu */}
            <div className={`md:hidden ${showMobileMenu ? 'block' : 'hidden'}`}>
              <div className="flex flex-col py-2">
                {TAB_GROUPS.map((group) => (
                  <div key={group.id}>
                    <div className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {group.label}
                    </div>
                    {group.tabs.map((tab) => (
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
                            {tab.label}
                          </span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Tab panels (desktop always; mobile when a panel is selected) */}
            <div
              className={`${!showMobileMenu ? 'block' : 'hidden md:block'} p-4 md:p-6 h-full`}
            >
              {TABS.map((tab) => {
                const TabComponent = tab.component;
                return (
                  activeTab === tab.id && (
                    <div
                      key={tab.id}
                      id={`panel-${tab.id}`}
                      role="tabpanel"
                      aria-label={tab.label}
                      className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
                    >
                      {tab.id === 'features' && (
                        <div className="mb-4">
                          <p className="text-slate-600 text-sm">
                            Control individual widget availability and access
                            levels.
                          </p>
                        </div>
                      )}
                      <TabComponent />
                    </div>
                  )
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
