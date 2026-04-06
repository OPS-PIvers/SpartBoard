import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Building2,
  Save,
  Languages,
  RefreshCw,
  User,
  Monitor,
  Zap,
} from 'lucide-react';
import { GoogleDriveIcon } from '@/components/common/GoogleDriveIcon';
import { Toggle } from '@/components/common/Toggle';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { APP_NAME } from '@/config/constants';
import { BUILDINGS } from '@/config/buildings';
import { TOOLS } from '@/config/tools';
import { SUPPORTED_LANGUAGES } from '@/i18n';

interface SidebarSettingsProps {
  isVisible: boolean;
  onCancel: () => void;
}

export const SidebarSettings: React.FC<SidebarSettingsProps> = ({
  isVisible,
  onCancel,
}) => {
  const { t, i18n } = useTranslation();
  const {
    activeDashboard,
    updateDashboardSettings,
    saveCurrentDashboard,
    addToast,
  } = useDashboard();
  const {
    signOut,
    connectGoogleDrive,
    selectedBuildings,
    setSelectedBuildings,
    refreshGoogleToken,
  } = useAuth();
  const { isConnected: isDriveConnected } = useGoogleDrive();

  const [settingsTab, setSettingsTab] = useState<
    'account' | 'appearance' | 'quick-access'
  >('account');

  const handleLanguageChange = (code: string) => {
    void i18n.changeLanguage(code);
    addToast(t('toasts.settingsSaved'), 'success');
  };

  const handleRefreshDrive = async () => {
    const token = await refreshGoogleToken();
    if (token) {
      addToast('Google Drive session refreshed', 'success');
    } else {
      addToast('Failed to refresh Google Drive session', 'error');
    }
  };

  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* TABS */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20 flex flex-col">
        <div className="p-4">
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xxs font-bold uppercase tracking-widest">
            <button
              onClick={() => setSettingsTab('account')}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${
                settingsTab === 'account'
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              <User className="w-3.5 h-3.5" /> Account
            </button>

            <button
              onClick={() => setSettingsTab('appearance')}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${
                settingsTab === 'appearance'
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> Appearance
            </button>

            <button
              onClick={() => setSettingsTab('quick-access')}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${
                settingsTab === 'quick-access'
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Quick Access
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-40">
        {/* ACCOUNT TAB */}
        {settingsTab === 'account' && (
          <>
            {/* Google Drive Connection Management */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1 mb-2">
                <GoogleDriveIcon className="w-4 h-4" />
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  {t('sidebar.settings.googleDriveIntegration')}
                </h3>
              </div>
              <p className="text-xxs text-slate-500 mb-4 px-1 leading-relaxed">
                {t('sidebar.settings.googleDriveDescription', {
                  appName: APP_NAME,
                })}
              </p>

              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2">
                  {isDriveConnected ? (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    {isDriveConnected
                      ? t('sidebar.settings.connectedSynced')
                      : t('sidebar.settings.disconnected')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (isDriveConnected) {
                        void signOut();
                      } else {
                        void connectGoogleDrive();
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xxxs font-black uppercase tracking-widest transition-all ${
                      isDriveConnected
                        ? 'text-slate-400 hover:text-brand-red-primary bg-slate-50 hover:bg-brand-red-lighter'
                        : 'bg-brand-blue-primary text-white shadow-sm'
                    }`}
                  >
                    {isDriveConnected
                      ? t('sidebar.settings.disconnect')
                      : t('sidebar.settings.connect')}
                  </button>

                  {isDriveConnected && (
                    <button
                      onClick={handleRefreshDrive}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-blue-primary bg-slate-50 hover:bg-brand-blue-lighter transition-all"
                      title="Refresh Drive Connection"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Languages className="w-4 h-4 text-slate-400" />
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  {t('sidebar.settings.language')}
                </h3>
              </div>
              <p className="text-xxs text-slate-500 mb-4 px-1 leading-relaxed">
                {t('sidebar.settings.languageDescription')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      i18n.language === lang.code
                        ? 'bg-brand-blue-primary border-brand-blue-primary text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-brand-blue-lighter hover:text-brand-blue-primary'
                    }`}
                  >
                    <span className="text-xxs font-black uppercase tracking-widest">
                      {lang.nativeLabel}
                    </span>
                    <span
                      className={`text-xxxs font-bold uppercase mt-1 ${
                        i18n.language === lang.code
                          ? 'text-white/60'
                          : 'text-slate-400'
                      }`}
                    >
                      {lang.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* My Building(s) */}
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  {t('sidebar.settings.myBuildings')}
                </h3>
              </div>
              <p className="text-xxs text-slate-500 mb-4 px-1 leading-relaxed">
                {t('sidebar.settings.myBuildingsDescription')}
              </p>
              <div className="flex flex-col gap-2">
                {BUILDINGS.map((building) => {
                  const isSelected = selectedBuildings.includes(building.id);
                  return (
                    <button
                      key={building.id}
                      onClick={() => {
                        const next = isSelected
                          ? selectedBuildings.filter((id) => id !== building.id)
                          : [...selectedBuildings, building.id];
                        void setSelectedBuildings(next);
                      }}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-brand-blue-lighter hover:text-brand-blue-primary'
                      }`}
                    >
                      <span className="text-xxs font-bold uppercase tracking-tight">
                        {building.name}
                      </span>
                      <span
                        className={`text-xxxs font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {building.gradeLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedBuildings.length === 0 && (
                <p className="text-xxs text-slate-500 mt-3 px-1 italic">
                  {t('sidebar.settings.noBuildingSelected')}
                </p>
              )}
            </div>
          </>
        )}

        {/* APPEARANCE TAB */}
        {settingsTab === 'appearance' && (
          <>
            {/* Interface Preferences */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Monitor className="w-4 h-4 text-slate-400" />
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  {t('sidebar.settings.interfacePreferences')}
                </h3>
              </div>
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xxs font-bold text-slate-700 uppercase tracking-tight">
                    {t('sidebar.settings.disableCloseWarning')}
                  </span>
                  <span className="text-xxs text-slate-500 leading-tight">
                    {t('sidebar.settings.skipConfirmation')}
                  </span>
                </div>
                <Toggle
                  size="sm"
                  checked={
                    activeDashboard?.settings?.disableCloseConfirmation ?? false
                  }
                  onChange={(checked) =>
                    updateDashboardSettings({
                      disableCloseConfirmation: checked,
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        {/* QUICK ACCESS TAB */}
        {settingsTab === 'quick-access' && (
          <>
            {/* Quick Access Widgets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                    {t('sidebar.settings.quickAccessWidgets')}
                  </h3>
                </div>
                <span className="text-xxxs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {activeDashboard?.settings?.quickAccessWidgets?.length ?? 0}/2
                </span>
              </div>
              <p className="text-xxs text-slate-500 mb-4 px-1 leading-relaxed">
                {t('sidebar.settings.quickAccessDescription')}
              </p>
              <div className="grid grid-cols-6 gap-2">
                {TOOLS.map((tool) => {
                  const isSelected =
                    activeDashboard?.settings?.quickAccessWidgets?.includes(
                      tool.type
                    );
                  const isFull =
                    (activeDashboard?.settings?.quickAccessWidgets?.length ??
                      0) >= 2;
                  const disabled = !isSelected && isFull;

                  return (
                    <div key={tool.type} className="group relative">
                      <button
                        onClick={() => {
                          const current =
                            activeDashboard?.settings?.quickAccessWidgets ?? [];
                          let next;
                          if (current.includes(tool.type)) {
                            next = current.filter((t) => t !== tool.type);
                          } else if (current.length < 2) {
                            next = [...current, tool.type];
                          } else {
                            return;
                          }
                          updateDashboardSettings({
                            quickAccessWidgets: next,
                          });
                        }}
                        disabled={disabled}
                        className={`w-full aspect-square flex flex-col items-center justify-center p-1.5 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-brand-blue-primary text-white shadow-sm scale-105 border-transparent'
                            : disabled
                              ? 'bg-white text-slate-200 cursor-not-allowed opacity-50 border-slate-100'
                              : 'bg-white text-slate-400 border border-slate-200 hover:border-brand-blue-lighter hover:text-brand-blue-primary'
                        }`}
                      >
                        <tool.icon className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xxxs font-bold uppercase tracking-widest rounded-md opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-modal shadow-lg scale-95 group-hover:scale-100">
                        {tool.label}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100 space-y-2 shrink-0">
        <button
          onClick={() => {
            saveCurrentDashboard();
            addToast(t('toasts.settingsSaved'), 'success');
          }}
          className="w-full py-3 bg-brand-blue-primary text-white rounded-xl font-bold text-xxs uppercase tracking-widest shadow-sm hover:bg-brand-blue-dark transition-all flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {t('sidebar.settings.saveAllChanges')}
        </button>
        <button
          onClick={onCancel}
          className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xxs uppercase tracking-widest hover:bg-slate-200 transition-all"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};
