import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { StarterPack } from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { Edit2, Trash2, Wand2 } from 'lucide-react';
import { useDialog } from '@/context/useDialog';

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

export const AdminStarterPackConfig = () => {
  const [packs, setPacks] = useState<StarterPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { showConfirm } = useDialog();

  const INITIAL_FORM_DATA: Partial<StarterPack> = {
    name: '',
    description: '',
    icon: 'Wand2',
    color: 'indigo',
    gradeLevels: [...ALL_GRADE_LEVELS],
    isLocked: true,
    widgets: [],
  };

  const [formData, setFormData] =
    useState<Partial<StarterPack>>(INITIAL_FORM_DATA);

  useEffect(() => {
    if (isAuthBypass) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const publicRef = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'starterPacks'
    );
    const unsub = onSnapshot(query(publicRef), (snapshot) => {
      const loadedPacks: StarterPack[] = [];
      snapshot.forEach((docSnap) =>
        loadedPacks.push({ ...docSnap.data(), id: docSnap.id } as StarterPack)
      );
      setPacks(loadedPacks);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!formData.name) return;

    try {
      if (editingId) {
        const docRef = doc(
          db,
          'artifacts',
          appId,
          'public',
          'data',
          'starterPacks',
          editingId
        );
        await updateDoc(docRef, { ...formData });
      } else {
        const publicRef = collection(
          db,
          'artifacts',
          appId,
          'public',
          'data',
          'starterPacks'
        );
        await addDoc(publicRef, { ...formData });
      }

      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        icon: 'Wand2',
        color: 'indigo',
        gradeLevels: [...ALL_GRADE_LEVELS],
        isLocked: true,
        widgets: [],
      });
    } catch (err) {
      console.error('Error saving pack:', err);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete this Starter Pack?',
      {
        title: 'Delete Starter Pack',
        variant: 'danger',
      }
    );

    if (confirmed) {
      try {
        await deleteDoc(
          doc(db, 'artifacts', appId, 'public', 'data', 'starterPacks', id)
        );
      } catch (err) {
        console.error('Error deleting pack:', err);
      }
    }
  };

  const handleEdit = (pack: StarterPack) => {
    setEditingId(pack.id);
    setFormData(pack);
  };

  if (loading) return <div>Loading Starter Packs...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-slate-200 rounded-xl p-4 space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">
          {editingId ? 'Edit Starter Pack' : 'Create New Starter Pack'}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input
              type="text"
              value={formData.name ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue-primary"
              placeholder="e.g. Reading Time"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Icon (Lucide name)
            </label>
            <input
              type="text"
              value={formData.icon ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, icon: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue-primary"
              placeholder="e.g. BookOpen"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-slate-700">
              Description
            </label>
            <input
              type="text"
              value={formData.description ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue-primary"
              placeholder="Brief description of the pack's purpose"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-slate-700">
              Grade Levels
            </label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {ALL_GRADE_LEVELS.map((level) => {
                const isSelected = formData.gradeLevels?.includes(level);
                return (
                  <button
                    key={level}
                    onClick={() => {
                      const current = formData.gradeLevels ?? [];
                      const next = isSelected
                        ? current.filter((l) => l !== level)
                        : [...current, level];
                      setFormData({ ...formData, gradeLevels: next });
                    }}
                    className={`px-3 py-1 text-sm font-medium rounded-full border transition-colors ${
                      isSelected
                        ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {level.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData(INITIAL_FORM_DATA);
              }}
              className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={!formData.name}
            className="px-4 py-2 bg-brand-blue-primary text-white rounded-lg font-medium hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {editingId ? 'Save Changes' : 'Create Pack'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-slate-800 text-lg">Existing Packs</h3>
        {packs.length === 0 ? (
          <p className="text-slate-500">
            No building-wide starter packs found.
          </p>
        ) : (
          <div className="grid gap-3">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-brand-blue-primary" />
                    {pack.name}
                  </h4>
                  <p className="text-sm text-slate-500">{pack.description}</p>
                  <div className="flex gap-1 mt-2">
                    {pack.gradeLevels.map((level) => (
                      <span
                        key={level}
                        className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200"
                      >
                        {level.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(pack)}
                    className="p-2 text-slate-400 hover:text-brand-blue-primary hover:bg-slate-50 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      void handleDelete(pack.id);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
