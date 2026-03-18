import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { db, isAuthBypass } from '@/config/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Save } from 'lucide-react';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

export const StarterPackSettings = () => {
  const { user } = useAuth();
  const { activeDashboard } = useDashboard();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [packName, setPackName] = useState('My Workspace');

  const handleRecordBoard = async () => {
    if (!user || isAuthBypass) return;

    try {
      setSaving(true);
      setSuccess(false);

      const widgets = activeDashboard?.widgets ?? [];
      const snapshot = createBoardSnapshot(widgets);

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

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to record board:', err);
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

      <div className="pt-2">
        <button
          onClick={() => {
            void handleRecordBoard();
          }}
          disabled={saving || !user || isAuthBypass}
          className="w-full flex flex-col items-center gap-2 px-4 py-4 rounded-xl font-bold bg-brand-blue-primary text-white hover:bg-brand-blue-dark transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-6 h-6" />
          {saving ? 'Recording Workspace...' : 'Record Current Workspace'}
          <span className="text-xs font-medium text-white/70">
            Saves all open widgets to your private collection
          </span>
        </button>
      </div>

      {success && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200 flex items-center justify-center">
          Workspace saved successfully!
        </div>
      )}
    </div>
  );
};

export default StarterPackSettings;
