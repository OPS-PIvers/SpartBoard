import { useAppVersion } from '@/hooks/useAppVersion';
import { RefreshCw, AlertCircle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { WhatsNewModal } from './WhatsNewModal';

declare const __APP_VERSION__: string;

interface UpdateNotificationProps {
  checkInterval?: number;
}

export const UpdateNotification = ({
  checkInterval = 60000,
}: UpdateNotificationProps) => {
  const { updateAvailable, reloadApp } = useAppVersion(checkInterval);
  const [dismissed, setDismissed] = useState(() => {
    // Restore dismissed state from sessionStorage
    const stored = sessionStorage.getItem('update-notification-dismissed');
    return stored === 'true';
  });
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Persist dismissed state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('update-notification-dismissed', String(dismissed));
  }, [dismissed]);

  if (!updateAvailable || dismissed) {
    return showWhatsNew ? (
      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={() => setShowWhatsNew(false)}
        mode="preview"
        currentVersion={__APP_VERSION__}
        updateAvailable={updateAvailable}
        onUpdate={reloadApp}
      />
    ) : null;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-toast animate-in slide-in-from-bottom-5 fade-in duration-300">
        <div
          className="bg-slate-800 text-white p-4 rounded-lg shadow-lg flex items-center gap-4 max-w-md border border-slate-700"
          role="status"
          aria-live="polite"
          aria-label="Application update available"
        >
          <div className="bg-blue-500/20 p-2 rounded-full">
            <AlertCircle className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Update Available</h3>
            <p className="text-xs text-slate-300 mt-1">
              A new version of the dashboard is available. Refresh to update.
            </p>
            <button
              type="button"
              onClick={() => setShowWhatsNew(true)}
              className="text-xs font-medium text-blue-300 hover:text-blue-100 underline-offset-2 hover:underline mt-1.5"
            >
              What&apos;s New
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={reloadApp}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {showWhatsNew && (
        <WhatsNewModal
          isOpen={showWhatsNew}
          onClose={() => setShowWhatsNew(false)}
          mode="preview"
          currentVersion={__APP_VERSION__}
          updateAvailable={updateAvailable}
          onUpdate={reloadApp}
        />
      )}
    </>
  );
};
