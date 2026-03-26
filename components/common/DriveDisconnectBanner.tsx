import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { useAuth } from '@/context/useAuth';

/** How long the banner stays dismissed after clicking the X (ms). */
const DISMISS_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const DriveDisconnectBanner: React.FC = () => {
  const { user, googleAccessToken, connectGoogleDrive } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConnected = !!googleAccessToken;

  // When Drive reconnects, clear the dismiss state and any pending re-show
  // timer so that a future disconnection can show the banner again.
  useEffect(() => {
    if (isConnected) {
      setDismissed(false);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [isConnected]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const handleDismiss = () => {
    // Clear any previous dismiss timer before setting a new one so that
    // multiple rapid clicks don't queue up redundant re-show callbacks.
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    setDismissed(true);
    // Re-show the banner after the dismiss duration
    dismissTimerRef.current = setTimeout(() => {
      setDismissed(false);
      dismissTimerRef.current = null;
    }, DISMISS_DURATION_MS);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectGoogleDrive();
    } finally {
      setIsConnecting(false);
    }
  };

  // Only show for authenticated users when Drive is not connected
  if (!user || isConnected || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-system-banner animate-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white rounded-xl shadow-xl border border-amber-200 p-3 flex items-center gap-3 max-w-[280px]">
        <div className="flex-shrink-0">
          <GoogleDriveIcon className="w-5 h-5 opacity-60" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 leading-tight mb-0.5">
            Drive Disconnected
          </p>
          <p className="text-xxs text-slate-500 leading-tight">
            Reconnect to resume auto-save.
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => void handleConnect()}
            disabled={isConnecting}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-blue-primary text-white text-xxxs font-black uppercase tracking-widest rounded-lg hover:bg-brand-blue-dark transition-all disabled:opacity-60"
          >
            {isConnecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              'Connect'
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
            title="Dismiss for 5 minutes"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
