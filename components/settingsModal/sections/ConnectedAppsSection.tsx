// Connected apps: the teacher's Claude connections, recent Claude changes, and Disconnect (CC-D10).
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Loader2, Plug, Sparkles } from 'lucide-react';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { SettingsSectionHeader } from '@/components/settingsModal/SettingsSectionHeader';
import { logError } from '@/utils/logError';

interface GrantRow {
  id: string;
  clientName: string;
  createdAt: number;
  lastRefreshedAt: number;
}

interface ActivityRow {
  id: string;
  action: 'create' | 'update' | 'restore';
  itemType: string;
  title: string;
  at: number;
}

const ACTION_LABELS: Record<ActivityRow['action'], string> = {
  create: 'Created',
  update: 'Edited',
  restore: 'Restored',
};
const ITEM_LABELS: Record<string, string> = {
  flashcard_set: 'flashcard set',
  folder: 'folder',
  quiz: 'quiz',
  question_bank: 'question bank',
  video_activity: 'video activity',
  rubric: 'rubric',
  activity_wall: 'Activity Wall',
  mini_app: 'mini-app',
  guided_learning: 'Guided Learning activity',
  meeting_notes: 'meeting notes draft for',
};

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const ConnectedAppsSection: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.uid;
  const [grants, setGrants] = React.useState<GrantRow[] | null>(null);
  const [activity, setActivity] = React.useState<ActivityRow[]>([]);
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!uid) return undefined;
    const grantsQuery = query(
      collection(db, 'users', uid, 'mcp_grants'),
      where('revokedAt', '==', null)
    );
    return onSnapshot(
      grantsQuery,
      (snap) =>
        setGrants(
          snap.docs
            .map((d) => ({
              id: d.id,
              clientName: String(d.get('clientName') ?? 'Claude'),
              createdAt: Number(d.get('createdAt') ?? 0),
              lastRefreshedAt: Number(d.get('lastRefreshedAt') ?? 0),
            }))
            .sort((a, b) => b.createdAt - a.createdAt)
        ),
      (err) => {
        logError('ConnectedAppsSection.grants', err, { uid });
        setGrants([]);
      }
    );
  }, [uid]);

  React.useEffect(() => {
    if (!uid) return undefined;
    const activityQuery = query(
      collection(db, 'users', uid, 'claude_activity'),
      orderBy('at', 'desc'),
      limit(10)
    );
    return onSnapshot(
      activityQuery,
      (snap) =>
        setActivity(
          snap.docs.map((d) => ({
            id: d.id,
            action: d.get('action') as ActivityRow['action'],
            itemType: String(d.get('itemType') ?? ''),
            title: String(d.get('title') ?? ''),
            at: Number(d.get('at') ?? 0),
          }))
        ),
      (err) => logError('ConnectedAppsSection.activity', err, { uid })
    );
  }, [uid]);

  const disconnect = async (grantId: string) => {
    setRevoking(grantId);
    setError(null);
    try {
      await httpsCallable<{ grantId: string }, { revoked: boolean }>(
        functions,
        'revokeMcpGrantV1'
      )({ grantId });
    } catch (err) {
      logError('ConnectedAppsSection.disconnect', err, { grantId });
      setError(
        t('settings.connectedApps.disconnectFailed', {
          defaultValue: 'Could not disconnect. Try again.',
        })
      );
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="p-5">
      <SettingsSectionHeader
        icon={<Plug className="w-4 h-4" />}
        title={t('settings.connectedApps.title', {
          defaultValue: 'Connected apps',
        })}
      />

      {grants === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      ) : grants.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800 mb-1">
            {t('settings.connectedApps.noneTitle', {
              defaultValue: 'Claude is not connected',
            })}
          </p>
          <p>
            {t('settings.connectedApps.howTo', {
              defaultValue:
                'In Claude, open Settings > Connectors, find SpartBoard, and choose Connect.',
            })}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5">
          {grants.map((grant) => (
            <li
              key={grant.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-blue-primary/10 flex items-center justify-center text-brand-blue-primary shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-slate-800 truncate">
                  {grant.clientName}
                </p>
                <p className="text-xs text-slate-500">
                  {t('settings.connectedApps.connectedOn', {
                    defaultValue: 'Connected {{date}}',
                    date: formatDate(grant.createdAt),
                  })}
                  {' · '}
                  {t('settings.connectedApps.lastActive', {
                    defaultValue: 'Active {{date}}',
                    date: formatDate(grant.lastRefreshedAt),
                  })}
                </p>
              </div>
              <button
                onClick={() => {
                  void disconnect(grant.id);
                }}
                disabled={revoking !== null}
                className="text-xs font-semibold text-brand-red-primary border border-brand-red-primary/30 rounded-lg px-3 py-1.5 hover:bg-brand-red-primary/5 disabled:opacity-60"
              >
                {revoking === grant.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  t('settings.connectedApps.disconnect', {
                    defaultValue: 'Disconnect',
                  })
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-2 text-sm text-brand-red-primary" role="alert">
          {error}
        </p>
      )}

      {activity.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            {t('settings.connectedApps.recent', {
              defaultValue: 'Recent changes by Claude',
            })}
          </h3>
          <ul className="grid gap-1.5 text-sm">
            {activity.map((row) => (
              <li key={row.id} className="flex gap-2 text-slate-600">
                <span className="text-slate-400 shrink-0 w-28">
                  {formatDate(row.at)}
                </span>
                <span className="min-w-0 truncate">
                  {ACTION_LABELS[row.action] ?? row.action}{' '}
                  {ITEM_LABELS[row.itemType] ?? row.itemType}{' '}
                  <span className="font-medium text-slate-800">
                    {row.title}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
