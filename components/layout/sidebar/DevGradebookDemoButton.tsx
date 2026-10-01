import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { GraduationCap } from 'lucide-react';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { isDevProject } from './DevSyncFromProdButton';

type DemoClass = {
  slug: string;
  title: string;
  students: { firstName: string; lastName: string; email: string }[];
};
type DemoRequest = { action: 'prepare' | 'seed' | 'remove' };
type DemoResponse = {
  classes?: DemoClass[];
  assignments?: number;
  rosterIds?: string[];
};

const callDemo = (action: DemoRequest['action']) =>
  httpsCallable<DemoRequest, DemoResponse>(functions, 'gradebookDemoV1', {
    timeout: 540_000,
  })({ action }).then((r) => r.data);

// Dev-only: seeds or removes sample Gradebook classes, assignments and marks.
export const DevGradebookDemoButton: React.FC = () => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { rosters, addRoster, deleteRoster, addToast } = useDashboard();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'seed' | 'remove' | null>(null);

  if (!isDevProject || isAdmin !== true) return null;

  const run = async (action: 'seed' | 'remove') => {
    setConfirming(false);
    setBusy(action);
    try {
      if (action === 'seed') {
        const { classes = [] } = await callDemo('prepare');
        for (const cls of classes) {
          if (rosters.some((r) => r.testClassId === cls.slug)) continue;
          await addRoster(
            cls.title,
            cls.students.map((s, i) => ({
              id: crypto.randomUUID(),
              firstName: s.firstName,
              lastName: s.lastName,
              pin: String(i + 1).padStart(2, '0'),
              email: s.email,
            })),
            { testClassId: cls.slug }
          );
        }
        const res = await callDemo('seed');
        addToast(
          t('sidebar.devGradebookDemo.seeded', {
            defaultValue: 'Seeded {{count}} demo assignments.',
            count: res.assignments ?? 0,
          }),
          'success'
        );
      } else {
        const { rosterIds = [] } = await callDemo('remove');
        for (const id of rosterIds) await deleteRoster(id);
        addToast(
          t('sidebar.devGradebookDemo.removed', {
            defaultValue: 'Removed the Gradebook demo.',
          }),
          'success'
        );
      }
    } catch (err) {
      console.error('[DevGradebookDemo] failed', err);
      addToast(
        t('sidebar.devGradebookDemo.failed', {
          defaultValue: 'Gradebook demo failed. Check console.',
        }),
        'error'
      );
    } finally {
      setBusy(null);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void run('seed')}
          className="text-xxs font-bold text-brand-blue-primary hover:underline"
        >
          {t('sidebar.devGradebookDemo.seed', { defaultValue: 'Seed' })}
        </button>
        <button
          type="button"
          onClick={() => void run('remove')}
          className="text-xxs font-bold text-brand-red-primary hover:underline"
        >
          {t('sidebar.devGradebookDemo.remove', { defaultValue: 'Remove' })}
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
      disabled={busy !== null}
      className="flex items-center gap-1 text-xxs font-bold text-brand-blue-primary hover:underline disabled:opacity-50"
    >
      <GraduationCap className={`w-3 h-3 ${busy ? 'animate-pulse' : ''}`} />
      {busy === 'seed'
        ? t('sidebar.devGradebookDemo.seeding', { defaultValue: 'Seeding…' })
        : busy === 'remove'
          ? t('sidebar.devGradebookDemo.removing', {
              defaultValue: 'Removing…',
            })
          : t('sidebar.devGradebookDemo.button', {
              defaultValue: 'Gradebook demo',
            })}
    </button>
  );
};
