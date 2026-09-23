import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { RefreshCw } from 'lucide-react';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';

export const isDevProject =
  import.meta.env.VITE_FIREBASE_PROJECT_ID === 'spartboard-dev';

type SyncResult = { copied: Record<string, number> };

// Dev-only: replaces this account's dev materials with a fresh copy of its prod ones.
export const DevSyncFromProdButton: React.FC = () => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { addToast } = useDashboard();
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (!isDevProject || isAdmin !== true) return null;

  const run = async () => {
    setConfirming(false);
    setSyncing(true);
    try {
      const sync = httpsCallable<void, SyncResult>(
        functions,
        'syncMyMaterialsFromProdV1',
        { timeout: 300_000 }
      );
      const { data } = await sync();
      const total = Object.values(data.copied).reduce((a, b) => a + b, 0);
      addToast(
        t('sidebar.devSync.done', {
          defaultValue: 'Copied {{count}} items from prod. Reloading…',
          count: total,
        }),
        'success'
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error('[DevSyncFromProd] failed', err);
      addToast(
        t('sidebar.devSync.failed', {
          defaultValue: 'Sync from prod failed. Check console.',
        }),
        'error'
      );
      setSyncing(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void run()}
          className="text-xxs font-bold text-brand-red-primary hover:underline"
        >
          {t('sidebar.devSync.confirm', {
            defaultValue: 'Replace dev copy?',
          })}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xxs text-slate-500 hover:underline"
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={syncing}
      title={t('sidebar.devSync.tooltip', {
        defaultValue:
          'Replace your boards, quizzes and other materials here with a fresh copy from spartboard.web.app. Rosters are not copied.',
      })}
      className="flex items-center gap-1 text-xxs font-bold text-brand-blue-primary hover:underline disabled:opacity-50"
    >
      <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
      {syncing
        ? t('sidebar.devSync.syncing', { defaultValue: 'Syncing…' })
        : t('sidebar.devSync.button', { defaultValue: 'Sync from prod' })}
    </button>
  );
};
