import React, { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { Globe, Save } from 'lucide-react';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { createBoardSnapshot } from '@/utils/widgetHelpers';

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

export const StarterPackField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { user, isAdmin } = useAuth();
  const { activeDashboard } = useDashboard();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<'personal' | 'global' | null>(null);
  const [packName, setPackName] = useState('My Workspace');
  const t = (leaf: string) => ctx.t(`widgetSettings.starter-pack.${leaf}`);

  const getWidgetSnapshot = () =>
    createBoardSnapshot(
      (activeDashboard?.widgets ?? []).filter(
        (widget) => widget.type !== 'starter-pack'
      )
    );

  const showSuccess = (kind: 'personal' | 'global') => {
    setSuccess(kind);
    window.setTimeout(() => setSuccess(null), 3000);
  };

  const handleSavePersonal = async () => {
    if (!user || isAuthBypass) return;
    try {
      setSaving(true);
      setSuccess(null);
      await addDoc(
        collection(db, 'artifacts', appId, 'users', user.uid, 'starterPacks'),
        {
          name: packName,
          description: t('capturedWorkspace'),
          icon: 'Wand2',
          color: 'indigo',
          gradeLevels: [...ALL_GRADE_LEVELS],
          isLocked: false,
          widgets: getWidgetSnapshot(),
        }
      );
      showSuccess('personal');
    } catch (error) {
      console.error('[StarterPack] Failed to save personal pack:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGlobal = async () => {
    if (!user || !isAdmin || isAuthBypass) return;
    try {
      setSaving(true);
      setSuccess(null);
      await addDoc(
        collection(db, 'artifacts', appId, 'public', 'data', 'starterPacks'),
        {
          name: packName,
          description: t('capturedWorkspace'),
          icon: 'Wand2',
          color: 'indigo',
          gradeLevels: [...ALL_GRADE_LEVELS],
          isLocked: true,
          widgets: getWidgetSnapshot(),
        }
      );
      showSuccess('global');
    } catch (error) {
      console.error('[StarterPack] Failed to save global pack:', error);
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || !user || isAuthBypass;

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <input
        type="text"
        value={packName}
        onChange={(event) => setPackName(event.target.value)}
        placeholder={t('packNamePlaceholder')}
        aria-label={t('packName')}
        className="w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-xs transition-colors focus:border-brand-blue-primary focus:outline-none"
      />
      <p className="text-xxs leading-relaxed text-slate-600">
        {t('description')}
      </p>
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSavePersonal()}
          disabled={disabled}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl bg-brand-blue-primary px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
        >
          <Save className="h-5 w-5" aria-hidden="true" />
          <span>{saving ? t('saving') : t('savePersonal')}</span>
          <span className="text-xs font-medium text-white/70">
            {t('savePersonalHint')}
          </span>
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => void handleSaveGlobal()}
            disabled={disabled}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Globe className="h-5 w-5" aria-hidden="true" />
            <span>{saving ? t('saving') : t('saveGlobal')}</span>
            <span className="text-xs font-medium text-white/70">
              {t('saveGlobalHint')}
            </span>
          </button>
        )}
      </div>
      {success === 'personal' && (
        <div className="flex items-center justify-center rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-700">
          {t('savedPersonal')}
        </div>
      )}
      {success === 'global' && (
        <div className="flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
          {t('savedGlobal')}
        </div>
      )}
    </div>
  );
};
