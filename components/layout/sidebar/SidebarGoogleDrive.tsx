import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, RefreshCw, Unlink } from 'lucide-react';
import { GoogleDriveIcon } from '@/components/common/GoogleDriveIcon';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { APP_NAME } from '@/config/constants';

interface SidebarGoogleDriveProps {
  isVisible: boolean;
}

export const SidebarGoogleDrive: React.FC<SidebarGoogleDriveProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const { disconnectGoogleDrive, connectGoogleDrive, refreshGoogleToken } =
    useAuth();
  const { isConnected: isDriveConnected } = useGoogleDrive();
  const { addToast } = useDashboard();

  const handleRefreshDrive = async () => {
    const token = await refreshGoogleToken();
    if (token) {
      addToast(
        t('sidebar.settings.driveRefreshed', {
          defaultValue: 'Google Drive session refreshed',
        }),
        'success'
      );
    } else {
      addToast(
        t('sidebar.settings.driveRefreshFailed', {
          defaultValue: 'Failed to refresh Google Drive session',
        }),
        'error'
      );
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
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-5">
          {/* Page Header */}
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <GoogleDriveIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                {t('sidebar.settings.googleDriveIntegration', {
                  defaultValue: 'Google Drive',
                })}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {t('sidebar.settings.googleDriveDescription', {
                appName: APP_NAME,
                defaultValue: `Your boards and assets are automatically backed up to your "${APP_NAME}" folder in Drive.`,
              })}
            </p>
          </div>

          {/* Connection Status Card */}
          <div
            className={`rounded-2xl border-2 p-5 transition-all ${
              isDriveConnected
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-amber-200 bg-amber-50/50'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              {isDriveConnected ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                      {t('sidebar.settings.connectedSynced', {
                        defaultValue: 'Connected & Synced',
                      })}
                    </p>
                    <p className="text-xxs text-emerald-600 mt-0.5">
                      {t('sidebar.settings.filesSyncAuto', {
                        defaultValue: 'Files sync automatically',
                      })}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                      {t('sidebar.settings.disconnected', {
                        defaultValue: 'Not Connected',
                      })}
                    </p>
                    <p className="text-xxs text-amber-600 mt-0.5">
                      {t('sidebar.settings.connectForBackup', {
                        defaultValue: 'Connect to enable cloud backup',
                      })}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {isDriveConnected ? (
                <>
                  <button
                    onClick={handleRefreshDrive}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-emerald-200 text-xxs font-bold text-emerald-700 uppercase tracking-wider hover:bg-emerald-50 transition-all shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t('sidebar.settings.refresh', {
                      defaultValue: 'Refresh',
                    })}
                  </button>
                  <button
                    onClick={() => disconnectGoogleDrive()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xxs font-bold text-slate-500 uppercase tracking-wider hover:text-brand-red-primary hover:border-brand-red-lighter hover:bg-red-50 transition-all shadow-sm"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    {t('sidebar.settings.disconnect', {
                      defaultValue: 'Disconnect',
                    })}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void connectGoogleDrive()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-blue-primary text-white text-xxs font-bold uppercase tracking-wider shadow-md hover:bg-brand-blue-dark transition-all"
                >
                  <GoogleDriveIcon className="w-4 h-4" />
                  {t('sidebar.settings.connect', {
                    defaultValue: 'Connect Google Drive',
                  })}
                </button>
              )}
            </div>
          </div>

          {/* Info Section */}
          <div className="space-y-3">
            <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
              {t('sidebar.settings.howItWorks', {
                defaultValue: 'How it works',
              })}
            </h3>
            <div className="space-y-2.5">
              {[
                {
                  step: '1',
                  text: t('sidebar.settings.driveStep1', {
                    defaultValue:
                      'Boards are saved as JSON files in your Drive',
                  }),
                },
                {
                  step: '2',
                  text: t('sidebar.settings.driveStep2', {
                    defaultValue:
                      'Uploaded images and assets sync automatically',
                  }),
                },
                {
                  step: '3',
                  text: t('sidebar.settings.driveStep3', {
                    defaultValue: 'Access your boards from any device',
                  }),
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3 px-1">
                  <div className="w-5 h-5 rounded-full bg-brand-blue-lighter flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xxxs font-black text-brand-blue-primary">
                      {item.step}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
