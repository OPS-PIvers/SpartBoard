import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Image as ImageIcon,
  Zap,
  Bell,
  ChevronLeft,
  Users,
  BarChart,
  LayoutTemplate,
  Puzzle,
} from 'lucide-react';

import { useAuth } from '@/context/useAuth';
import { FeaturePermissionsManager } from './FeaturePermissionsManager';
import { BackgroundManager } from './BackgroundManager';
import { GlobalPermissionsManager } from './GlobalPermissionsManager';
import { AnnouncementsManager } from './Announcements';
import { UserManagementPanel } from './UserManagement/UserManagementPanel';
import { AnalyticsManager } from './Analytics/AnalyticsManager';
import { DashboardTemplatesManager } from './DashboardTemplatesManager';
const LazyWidgetBuilderManager = React.lazy(() =>
  import('./WidgetBuilderManager').then((m) => ({
    default: m.WidgetBuilderManager,
  }))
);

interface AdminSettingsProps {
  onClose: () => void;
}

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
  const [activeTab, setActiveTab] = useState<
    | 'features'
    | 'global'
    | 'backgrounds'
    | 'announcements'
    | 'users'
    | 'analytics'
    | 'templates'
    | 'widgets'
  >('features');

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

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-settings-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 px-4 flex items-center justify-between shadow-sm shrink-0">
          {/* Left: Navigation & Title */}
          <div className="flex items-center gap-2 overflow-hidden">
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors shrink-0"
              aria-label="Close settings"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Settings className="w-4 h-4 text-white/70 shrink-0" />
              <h2
                id="admin-settings-title"
                className="text-lg font-bold truncate"
              >
                Admin Settings
              </h2>
            </div>
          </div>

          {/* Right: Tabs */}
          <div className="flex gap-1 ml-4" role="tablist">
            <TabButton
              id="tab-features"
              controls="panel-features"
              isActive={activeTab === 'features'}
              onClick={() => setActiveTab('features')}
              icon={<Shield className="w-4 h-4" />}
              label="Feature Permissions"
            />
            <TabButton
              id="tab-global"
              controls="panel-global"
              isActive={activeTab === 'global'}
              onClick={() => setActiveTab('global')}
              icon={<Zap className="w-4 h-4" />}
              label="Global Settings"
            />
            <TabButton
              id="tab-backgrounds"
              controls="panel-backgrounds"
              isActive={activeTab === 'backgrounds'}
              onClick={() => setActiveTab('backgrounds')}
              icon={<ImageIcon className="w-4 h-4" />}
              label="Background Manager"
            />
            <TabButton
              id="tab-announcements"
              controls="panel-announcements"
              isActive={activeTab === 'announcements'}
              onClick={() => setActiveTab('announcements')}
              icon={<Bell className="w-4 h-4" />}
              label="Announcements"
            />
            <TabButton
              id="tab-users"
              controls="panel-users"
              isActive={activeTab === 'users'}
              onClick={() => setActiveTab('users')}
              icon={<Users className="w-4 h-4" />}
              label="User Management"
            />
            <TabButton
              id="tab-analytics"
              controls="panel-analytics"
              isActive={activeTab === 'analytics'}
              onClick={() => setActiveTab('analytics')}
              icon={<BarChart className="w-4 h-4" />}
              label="Analytics"
            />
            <TabButton
              id="tab-templates"
              controls="panel-templates"
              isActive={activeTab === 'templates'}
              onClick={() => setActiveTab('templates')}
              icon={<LayoutTemplate className="w-4 h-4" />}
              label="Templates"
            />
            <TabButton
              id="tab-widgets"
              controls="panel-widgets"
              isActive={activeTab === 'widgets'}
              onClick={() => setActiveTab('widgets')}
              icon={<Puzzle className="w-4 h-4" />}
              label="Widget Builder"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {activeTab === 'features' && (
            <div
              id="panel-features"
              role="tabpanel"
              aria-labelledby="tab-features"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
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
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <GlobalPermissionsManager />
            </div>
          )}

          {activeTab === 'backgrounds' && (
            <div
              id="panel-backgrounds"
              role="tabpanel"
              aria-labelledby="tab-backgrounds"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
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
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <DashboardTemplatesManager />
            </div>
          )}

          {activeTab === 'widgets' && (
            <div
              id="panel-widgets"
              role="tabpanel"
              aria-labelledby="tab-widgets"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="mb-4">
                <p className="text-slate-600 text-sm">
                  Create custom no-code widgets using the block builder or
                  AI-assisted code editor.
                </p>
              </div>
              <React.Suspense
                fallback={
                  <div className="text-slate-400 text-sm p-4 text-center">
                    Loading builder…
                  </div>
                }
              >
                <LazyWidgetBuilderManager />
              </React.Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
