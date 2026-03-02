import React, { useState } from 'react';
import {
  Settings,
  X,
  Shield,
  Image as ImageIcon,
  Zap,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { FeaturePermissionsManager } from './FeaturePermissionsManager';
import { BackgroundManager } from './BackgroundManager';
import { GlobalPermissionsManager } from './GlobalPermissionsManager';
import { AnnouncementsManager } from './AnnouncementsManager';

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
    className={`px-4 py-3 rounded-t-xl font-bold text-sm uppercase tracking-wide flex items-center gap-2 transition-colors ${
      isActive
        ? 'bg-brand-blue-primary text-white shadow-md'
        : 'text-white/70 hover:bg-white/20 hover:text-white'
    }`}
  >
    {icon}
    {label}
  </button>
);

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onClose }) => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'features' | 'global' | 'backgrounds' | 'announcements'
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
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white p-6 pb-0 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6" />
              <h2 id="admin-settings-title" className="text-2xl font-bold">
                Admin Settings
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/30 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-2" role="tablist">
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
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Widget Permissions
                </h3>
                <p className="text-slate-600">
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
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Global App Settings
                </h3>
                <p className="text-slate-600">
                  Manage app-wide features like Gemini AI, Live Sessions, and
                  Board Sharing.
                </p>
              </div>
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
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Background Management
                </h3>
                <p className="text-slate-600">
                  Upload and manage background presets available to users.
                  Control visibility and access permissions for each background.
                </p>
              </div>
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
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Announcements
                </h3>
                <p className="text-slate-600">
                  Push widget-based announcements to users in real time. Control
                  when they activate, how they can be dismissed, and which
                  buildings receive them.
                </p>
              </div>
              <AnnouncementsManager />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
