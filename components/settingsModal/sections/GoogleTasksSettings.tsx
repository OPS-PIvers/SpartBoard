// Google Tasks opt-in for team action items (docs/plans/GOOGLE_TASKS_ACTION_ITEMS.md D1).
import React from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { functions, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { Toggle } from '@/components/common/Toggle';
import { requestAndExchangeAuthCode } from '@/utils/googleOAuthRefresh';
import { logError } from '@/utils/logError';

export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

interface SyncStatus {
  enabled: boolean;
  disconnectReason: string | null;
  syncedCount: number;
}

export const GoogleTasksSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.uid;
  const [status, setStatus] = React.useState<SyncStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!uid || isAuthBypass) return undefined;
    let cancelled = false;
    httpsCallable<void, SyncStatus>(functions, 'getGoogleTasksSyncStatusV1')()
      .then((res) => {
        if (!cancelled) setStatus(res.data);
      })
      .catch((err: unknown) => {
        logError('GoogleTasksSettings.status', err, { uid });
        if (!cancelled) {
          setStatus({ enabled: false, disconnectReason: null, syncedCount: 0 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const failed = t('settings.connectedApps.googleTasks.failed', {
    defaultValue: "Couldn't connect to Google Tasks. Try again.",
  });

  const setEnabled = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
          | string
          | undefined;
        if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
        const outcome = await requestAndExchangeAuthCode(
          clientId,
          user?.email ?? undefined,
          [GOOGLE_TASKS_SCOPE]
        );
        if (outcome.kind === 'cancelled') return;
        if (outcome.kind !== 'success') {
          throw new Error(
            outcome.kind === 'error' ? outcome.reason : outcome.cause
          );
        }
      }
      const res = await httpsCallable<
        { enabled: boolean },
        { enabled: boolean; syncedCount: number }
      >(
        functions,
        'setGoogleTasksSyncV1'
      )({ enabled });
      setStatus({
        enabled: res.data.enabled,
        disconnectReason: null,
        syncedCount: res.data.syncedCount,
      });
    } catch (err) {
      logError('GoogleTasksSettings.setEnabled', err, { enabled });
      setError(failed);
    } finally {
      setBusy(false);
    }
  };

  const needsReconnect =
    !!status && !status.enabled && !!status.disconnectReason;

  return (
    <div className="mt-6">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
        {t('settings.connectedApps.googleTasks.heading', {
          defaultValue: 'Google Tasks',
        })}
      </h3>
      <div className="border-t border-slate-200 pt-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex-1 font-medium text-slate-800">
            {t('settings.connectedApps.googleTasks.toggle', {
              defaultValue: 'Send my team action items to Google Tasks',
            })}
          </span>
          {busy || status === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <Toggle
              checked={status.enabled}
              onChange={(next) => {
                void setEnabled(next);
              }}
              size="sm"
              showLabels={false}
              anchor={tourAttr('connected-apps.google-tasks-sync')}
              label={t('settings.connectedApps.googleTasks.toggle', {
                defaultValue: 'Send my team action items to Google Tasks',
              })}
            />
          )}
        </div>
        {status?.enabled && (
          <p className="mt-1.5 text-xs text-slate-500">
            {t('settings.connectedApps.googleTasks.connected', {
              defaultValue: 'Connected · {{count}} items synced',
              count: status.syncedCount,
            })}
          </p>
        )}
        {needsReconnect && !busy && (
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="text-brand-red-primary">
              {t('settings.connectedApps.googleTasks.stopped', {
                defaultValue: 'Google Tasks stopped syncing.',
              })}
            </span>
            <button
              type="button"
              onClick={() => {
                void setEnabled(true);
              }}
              className="font-semibold text-brand-blue-primary underline"
            >
              {t('settings.connectedApps.googleTasks.reconnect', {
                defaultValue: 'Reconnect',
              })}
            </button>
          </div>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-brand-red-primary" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
