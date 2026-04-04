import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Image as ImageIcon,
  Zap,
  Bell,
  ChevronLeft,
  ChevronRight,
  Users,
  BarChart,
  LayoutTemplate,
} from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { FeaturePermissionsManager } from './FeaturePermissionsManager';
import { BackgroundManager } from './BackgroundManager';
import { GlobalPermissionsManager } from './GlobalPermissionsManager';
import { AnnouncementsManager } from './Announcements';
import { UserManagementPanel } from './UserManagement/UserManagementPanel';
import { AnalyticsManager } from './Analytics/AnalyticsManager';
import { DashboardTemplatesManager } from './DashboardTemplatesManager';

interface AdminSettingsProps {
  onClose: () => void;
}

const TABS = [
  { id: 'features', label: 'Feature Permissions', icon: Shield },
  { id: 'global', label: 'Global Settings', icon: Zap },
  { id: 'backgrounds', label: 'Background Manager', icon: ImageIcon },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
] as const;

type TabId = (typeof TABS)[number]['id'];

const TabButton: React.FC<{
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  id: string;
  controls: string;
}> = ({ isActive, onClick, icon, label, id, controls }) => (
  <button
    id={id}
    role="tab"
    aria-selected={isActive}
    aria-controls={controls}
    tabIndex={isActive ? 0 : -1}
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full font-bold text-xs uppercase tracking-wide flex items-center gap-2 transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-white text-brand-blue-dark shadow-sm'
        : 'text-white/80 hover:bg-white/20 hover:text-white'
    }`}
    title={label}
  >
    {icon}
    <span className="hidden lg:inline">{label}</span>
  </button>
);

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onClose }) => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('features');
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  // Close modal on Escape key press
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!isAdmin) {
    return null;
  }

  const activeTabConfig = TABS.find((t) => t.id === activeTab);
  const title =
    !showMobileMenu && activeTabConfig
      ? activeTabConfig.label
      : 'Admin Settings';

  const handleBackOrClose = () => {
    if (!showMobileMenu) {
      setShowMobileMenu(true);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-settings-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          {/* Left: Navigation & Title */}
          <div className="flex items-center gap-2 overflow-hidden w-full md:w-auto">
            <button
              onClick={handleBackOrClose}
              className="p-2 md:p-1.5 hover:bg-white/20 rounded-lg transition-colors shrink-0 -ml-2 md:ml-0"
              aria-label={!showMobileMenu ? 'Back to menu' : 'Close settings'}
            >
              <ChevronLeft className="w-6 h-6 md:w-5 md:h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {showMobileMenu || <div className="md:hidden" />}
              <Settings className="w-5 h-5 md:w-4 md:h-4 text-white/70 shrink-0 hidden md:block" />
              <h2
                id="admin-settings-title"
                className="text-lg md:text-lg font-bold truncate flex-1 md:flex-none"
              >
                <span className="md:hidden">{title}</span>
                <span className="hidden md:inline">Admin Settings</span>
              </h2>
            </div>
          </div>

          {/* Right: Tabs (Desktop only) */}
          <div className="hidden md:flex gap-1 ml-4" role="tablist">
            {TABS.map((tab) => (
              <TabButton
                key={tab.id}
                id={`tab-${tab.id}`}
                controls={`panel-${tab.id}`}
                isActive={activeTab === tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setShowMobileMenu(false);
                }}
                icon={<tab.icon className="w-4 h-4" />}
                label={tab.label}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-none touch-pan-y bg-slate-50 md:bg-slate-50/50">
          {/* Mobile Menu */}
          <div className={`md:hidden ${showMobileMenu ? 'block' : 'hidden'}`}>
            <div className="flex flex-col py-2">
              {TABS.map((tab) => (
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
          </div>

          {/* Desktop/Tablet Tab Panels & Active Mobile Panel */}
          <div
            className={`${!showMobileMenu ? 'block' : 'hidden md:block'} p-4 md:p-6 h-full`}
          >
            {activeTab === 'features' && (
              <div
                id="panel-features"
                role="tabpanel"
                aria-labelledby="tab-features"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <div className="mb-4">
                  <p className="text-slate-600 text-sm">
                    Control individual widget availability and access levels.
                  </p>
                </div>
                <FeaturePermissionsManager />
              </div>
            )}

            {activeTab === 'global' && (
              <div
                id="panel-global"
                role="tabpanel"
                aria-labelledby="tab-global"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <GlobalPermissionsManager />
              </div>
            )}

            {activeTab === 'backgrounds' && (
              <div
                id="panel-backgrounds"
                role="tabpanel"
                aria-labelledby="tab-backgrounds"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <BackgroundManager />
              </div>
            )}

            {activeTab === 'announcements' && (
              <div
                id="panel-announcements"
                role="tabpanel"
                aria-labelledby="tab-announcements"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <AnnouncementsManager />
              </div>
            )}

            {activeTab === 'users' && (
              <div
                id="panel-users"
                role="tabpanel"
                aria-labelledby="tab-users"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <UserManagementPanel />
              </div>
            )}

            {activeTab === 'analytics' && (
              <div
                id="panel-analytics"
                role="tabpanel"
                aria-labelledby="tab-analytics"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <AnalyticsManager />
              </div>
            )}

            {activeTab === 'templates' && (
              <div
                id="panel-templates"
                role="tabpanel"
                aria-labelledby="tab-templates"
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
              >
                <DashboardTemplatesManager />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
