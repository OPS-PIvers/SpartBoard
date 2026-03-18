import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { db, isAuthBypass } from '@/config/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Save, Globe } from 'lucide-react';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

export const StarterPackSettings = () => {
  const { user, isAdmin } = useAuth();
  const { activeDashboard } = useDashboard();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<'personal' | 'global' | null>(null);
  const [packName, setPackName] = useState('My Workspace');

  const getWidgetSnapshot = () => {
    // Capture only active widgets (not the background, not the starter-pack widget itself)
    const widgets = (activeDashboard?.widgets ?? []).filter(
      (w) => w.type !== 'starter-pack'
    );
    return createBoardSnapshot(widgets);
  };

  const handleSavePersonal = async () => {
    if (!user || isAuthBypass) return;

    try {
      setSaving(true);
      setSuccess(null);

      const snapshot = getWidgetSnapshot();

      const userPacksRef = collection(
        db,
        'artifacts',
        appId,
        'users',
        user.uid,
        'starterPacks'
      );
      await addDoc(userPacksRef, {
        name: packName,
        description: 'Captured workspace',
        icon: 'Wand2',
        color: 'indigo',
        gradeLevels: [...ALL_GRADE_LEVELS],
        isLocked: false,
        widgets: snapshot,
      });

      setSuccess('personal');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to record board:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGlobal = async () => {
    if (!user || !isAdmin || isAuthBypass) return;

    try {
      setSaving(true);
      setSuccess(null);

      const snapshot = getWidgetSnapshot();

      const publicPacksRef = collection(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'starterPacks'
      );
      await addDoc(publicPacksRef, {
        name: packName,
        description: 'Captured workspace',
        icon: 'Wand2',
        color: 'indigo',
        gradeLevels: [...ALL_GRADE_LEVELS],
        isLocked: true,
        widgets: snapshot,
      });

      setSuccess('global');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save global pack:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 block">
          Pack Name
        </label>
        <input
          type="text"
          value={packName}
          onChange={(e) => setPackName(e.target.value)}
          placeholder="e.g. Reading Time"
          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-brand-blue-primary focus:outline-none transition-colors"
        />
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Captures all open widgets — their types, positions, and sizes — as a
        reusable starter pack. The background is not included.
      </p>

      <div className="space-y-2 pt-1">
        <button
          onClick={() => {
            void handleSavePersonal();
          }}
          disabled={saving || !user || isAuthBypass}
          className="w-full flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl font-bold bg-brand-blue-primary text-white hover:bg-brand-blue-dark transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? 'Saving...' : 'Save to My Collection'}</span>
          <span className="text-xs font-medium text-white/70">
            Private — only visible to you
          </span>
        </button>

        {isAdmin && (
          <button
            onClick={() => {
              void handleSaveGlobal();
            }}
            disabled={saving || !user || isAuthBypass}
            className="w-full flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Globe className="w-5 h-5" />
            <span>{saving ? 'Saving...' : 'Save Globally'}</span>
            <span className="text-xs font-medium text-white/70">
              Building-wide — visible to all teachers
            </span>
          </button>
        )}
      </div>

      {success === 'personal' && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200 flex items-center justify-center">
          Saved to your personal collection!
        </div>
      )}
      {success === 'global' && (
        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-200 flex items-center justify-center">
          Saved to building-wide starter packs!
        </div>
      )}
    </div>
  );
};

export const StarterPackAppearanceSettings: React.FC = () => {
  return (
    <div className="text-slate-500 italic text-sm p-2 text-center">
      No additional style settings available.
    </div>
  );
};

export default StarterPackSettings;
