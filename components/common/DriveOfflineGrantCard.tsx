import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { useAuth } from '@/context/useAuth';

// Long enough that a teacher who dismisses isn't re-asked the same week, short
// enough that coverage still climbs. They keep working either way.
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_STORAGE_KEY = 'spart_offline_grant_dismissed_until';

const readStoredDismissUntil = (): number => {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
};

/**
 * One-time prompt to capture a server-side Google refresh token.
 *
 * Without one, Drive access survives only while the browser's Google session
 * does — which is why teachers see "Drive Disconnected" after a weekend. This
 * asks once, from a real click so the consent popup is never blocker-suppressed.
 */
export const DriveOfflineGrantCard: React.FC = () => {
  const { user, offlineGrantMissing, captureOfflineGrant } = useAuth();
  const [dismissedUntil, setDismissedUntil] = useState(readStoredDismissUntil);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleDismiss = () => {
    const until = Date.now() + DISMISS_DURATION_MS;
    setDismissedUntil(until);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(until));
    } catch {
      // localStorage unavailable — dismiss falls back to in-memory only.
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const ok = await captureOfflineGrant();
      // A decline or a withheld refresh leg leaves the card up rather than
      // pretending it worked; dismissing is still one click away.
      if (!ok) return;
      try {
        localStorage.removeItem(DISMISS_STORAGE_KEY);
      } catch {
        // Non-fatal.
      }
    } finally {
      setIsConnecting(false);
    }
  };

  if (!user || !offlineGrantMissing || dismissedUntil > Date.now()) return null;

  return (
    <div className="fixed bottom-4 right-4 z-system-banner animate-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 flex items-center gap-3 max-w-[300px]">
        <div className="flex-shrink-0">
          <GoogleDriveIcon className="w-5 h-5 opacity-60" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 leading-tight mb-0.5">
            Stay connected to Drive
          </p>
          <p className="text-xxs text-slate-500 leading-tight">
            Approve once and SpartBoard stops asking you to reconnect.
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => void handleConnect()}
            disabled={isConnecting}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-blue-primary text-white text-xxxs font-black uppercase tracking-widest rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-60"
          >
            {isConnecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              'Approve'
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="Not now"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
