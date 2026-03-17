mkdir -p components/widgets/StarterPack
cat << 'AUDIO_EOF' > components/widgets/StarterPack/audioUtils.ts
// Singleton-like Audio Manager to prevent performance issues
let audioCtx: AudioContext | null = null;

// Add type definition for webkitAudioContext
interface CustomWindow extends Window {
  webkitAudioContext: typeof AudioContext;
}

export const getAudioCtx = () => {
  if (typeof window === 'undefined') return null; // Guard against SSR/non-browser env
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as CustomWindow).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
};

export const playCleanUp = () => {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state === 'suspended') return;
    const now = ctx.currentTime;

    // Subtle "Soft Chime" using two sine waves
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now); // G5 (Harmonic)

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now); // Remove high-frequency "sharpness"

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02); // Soft attack
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6); // Gentle decay

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(now + 0.7);
    osc2.stop(now + 0.7);
  } catch (_e) {
    // Audio failed - silently ignore
  }
};
AUDIO_EOF

cat << 'WIDGET_EOF' > components/widgets/StarterPack/Widget.tsx
import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStarterPacks } from '@/hooks/useStarterPacks';
import { WidgetComponentProps, StarterPack } from '@/types';
import * as LucideIcons from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCleanUp, getAudioCtx } from './audioUtils';

export const StarterPackWidget = ({ isStudentView }: WidgetComponentProps) => {
  const { user } = useAuth();
  const { addWidget, deleteAllWidgets } = useDashboard();
  const { publicPacks, userPacks, loading, executePack } = useStarterPacks(user?.uid);

  // Combine packs for display
  const allPacks = [...publicPacks, ...userPacks];

  const handleExecute = (pack: StarterPack) => {
    // Unlock audio context if needed
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Call the execution logic with cleanSlate=true
    executePack(pack, true, addWidget, deleteAllWidgets);

    // Audio and visual cues
    playCleanUp();
    void confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  if (isStudentView) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Not available in student view
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex-1 overflow-y-auto min-h-0">
      {loading ? (
        <div className="flex items-center justify-center h-full text-slate-500">
          Loading packs...
        </div>
      ) : allPacks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-2">
          <LucideIcons.Wand2 className="w-8 h-8 opacity-50" />
          <p>No starter packs available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {allPacks.map((pack) => {
            const iconName = pack.icon as keyof typeof LucideIcons;
            const IconComponent = (LucideIcons[iconName] as React.ComponentType<{ className?: string }>) ?? LucideIcons.Wand2;

            return (
              <button
                key={pack.id}
                onClick={() => handleExecute(pack)}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all hover:-translate-y-1 hover:shadow-md
                  bg-white border-slate-200 hover:border-${pack.color}-500 group`}
              >
                <div className={`p-3 rounded-xl bg-${pack.color}-100 text-${pack.color}-600 group-hover:scale-110 transition-transform`}>
                  <IconComponent className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">
                    {pack.name}
                  </h3>
                  {pack.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {pack.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StarterPackWidget;
WIDGET_EOF

cat << 'SETTINGS_EOF' > components/widgets/StarterPack/Settings.tsx
import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { db, isAuthBypass } from '@/config/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Save } from 'lucide-react';

const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;
const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const appId = envAppId ? String(envAppId) : envProjectId ? String(envProjectId) : 'spart-board';

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

      const widgets = activeDashboard?.widgets || [];
      const snapshot = createBoardSnapshot(widgets);

      const userPacksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'starterPacks');
      await addDoc(userPacksRef, {
        name: packName,
        description: 'Captured workspace',
        icon: 'Wand2',
        color: 'indigo',
        gradeLevels: ['k-2', '3-5', '6-8', '9-12'],
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
          onClick={() => { void handleRecordBoard(); }}
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
SETTINGS_EOF

cat << 'HOOK_EOF' > hooks/useStarterPacks.ts
import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { StarterPack, WidgetType, AddWidgetOverrides } from '@/types';

const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;
const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const appId = envAppId ? String(envAppId) : envProjectId ? String(envProjectId) : 'spart-board';

export function useStarterPacks(userId?: string | null) {
  const [publicPacks, setPublicPacks] = useState<StarterPack[]>([]);
  const [userPacks, setUserPacks] = useState<StarterPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthBypass) {
      setTimeout(() => {
        setPublicPacks([]);
        setUserPacks([]);
        setLoading(false);
      }, 0);
      return;
    }

    setTimeout(() => setLoading(true), 0);

    const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'starterPacks');
    const unsubPublic = onSnapshot(query(publicRef), (snapshot) => {
      const packs: StarterPack[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        packs.push({ ...data, id: doc.id } as StarterPack);
      });
      setPublicPacks(packs);
    }, (err) => {
      console.error('Failed to subscribe to public starter packs:', err);
    });

    let unsubUser: (() => void) | undefined;
    if (userId) {
      const userRef = collection(db, 'artifacts', appId, 'users', userId, 'starterPacks');
      unsubUser = onSnapshot(query(userRef), (snapshot) => {
        const packs: StarterPack[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          packs.push({ ...data, id: doc.id } as StarterPack);
        });
        setUserPacks(packs);
      }, (err) => {
        console.error('Failed to subscribe to user starter packs:', err);
      });
    } else {
      setTimeout(() => setUserPacks([]), 0);
    }

    setTimeout(() => setLoading(false), 0);

    return () => {
      unsubPublic();
      if (unsubUser) unsubUser();
    };
  }, [userId]);

  const executePack = useCallback((
    pack: StarterPack,
    cleanSlate: boolean,
    addWidget: (type: WidgetType, overrides?: AddWidgetOverrides) => void,
    deleteAllWidgets: () => void
  ) => {
    if (cleanSlate) {
      deleteAllWidgets();
    }

    pack.widgets.forEach((widget) => {
      addWidget(widget.type, { ...widget, id: crypto.randomUUID(), config: structuredClone(widget.config) } as unknown as AddWidgetOverrides);
    });
  }, []);

  return { publicPacks, userPacks, loading, executePack };
}
HOOK_EOF

cat << 'MODAL_EOF' > components/admin/StarterPackConfigModal.tsx
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { StarterPack } from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { Edit2, Trash2, Wand2 } from 'lucide-react';
import { useDialog } from '@/context/useDialog';

const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;
const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const appId = envAppId ? String(envAppId) : envProjectId ? String(envProjectId) : 'spart-board';

export const AdminStarterPackConfig = () => {
  const [packs, setPacks] = useState<StarterPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { showConfirm } = useDialog();

  const [formData, setFormData] = useState<Partial<StarterPack>>({
    name: '',
    description: '',
    icon: 'Wand2',
    color: 'indigo',
    gradeLevels: [...ALL_GRADE_LEVELS],
    isLocked: true,
    widgets: [],
  });

  useEffect(() => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }

    const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'starterPacks');
    const unsub = onSnapshot(query(publicRef), (snapshot) => {
      const loadedPacks: StarterPack[] = [];
      snapshot.forEach((docSnap) => loadedPacks.push({ ...docSnap.data(), id: docSnap.id } as StarterPack));
      setPacks(loadedPacks);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!formData.name) return;

    try {
      if (editingId) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'starterPacks', editingId);
        await updateDoc(docRef, { ...formData });
      } else {
        const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'starterPacks');
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
    const confirmed = await showConfirm('Are you sure you want to delete this Starter Pack?', {
      title: 'Delete Starter Pack',
      variant: 'danger',
    });

    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'starterPacks', id));
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
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue-primary"
              placeholder="e.g. Reading Time"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Icon (Lucide name)</label>
            <input
              type="text"
              value={formData.icon || ''}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue-primary"
              placeholder="e.g. BookOpen"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <input
              type="text"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-brand-blue-primary"
              placeholder="Brief description of the pack's purpose"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-slate-700">Grade Levels</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {ALL_GRADE_LEVELS.map(level => {
                const isSelected = formData.gradeLevels?.includes(level);
                return (
                  <button
                    key={level}
                    onClick={() => {
                      const current = formData.gradeLevels || [];
                      const next = isSelected
                        ? current.filter(l => l !== level)
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
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  name: '', description: '', icon: 'Wand2', color: 'indigo',
                  gradeLevels: [...ALL_GRADE_LEVELS], isLocked: true, widgets: []
                });
              }}
              className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => { void handleSave(); }}
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
          <p className="text-slate-500">No building-wide starter packs found.</p>
        ) : (
          <div className="grid gap-3">
            {packs.map((pack) => (
              <div key={pack.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-brand-blue-primary" />
                    {pack.name}
                  </h4>
                  <p className="text-sm text-slate-500">{pack.description}</p>
                  <div className="flex gap-1 mt-2">
                    {pack.gradeLevels.map(level => (
                      <span key={level} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                        {level.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(pack)} className="p-2 text-slate-400 hover:text-brand-blue-primary hover:bg-slate-50 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { void handleDelete(pack.id); }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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
MODAL_EOF

cat << 'ADMIN_SETTINGS_EOF' > patch_admin_settings.py
import re

with open("components/admin/AdminSettings.tsx", "r") as f:
    content = f.read()

# Only patch if it doesn't already have starter-packs
if "tab-starter-packs" not in content:
    content = content.replace("import { MusicManager } from './MusicManager';", "import { MusicManager } from './MusicManager';\nimport { AdminStarterPackConfig } from './StarterPackConfigModal';\nimport { Wand2 } from 'lucide-react';")
    content = content.replace("'features' | 'global' | 'backgrounds' | 'announcements' | 'music'", "'features' | 'global' | 'backgrounds' | 'announcements' | 'music' | 'starter-packs'")

    content = content.replace("""            <TabButton
              id="tab-music"
              controls="panel-music"
              isActive={activeTab === 'music'}
              onClick={() => setActiveTab('music')}
              icon={<Music className="w-4 h-4" />}
              label="Music Library"
            />
          </div>
        </div>""", """            <TabButton
              id="tab-music"
              controls="panel-music"
              isActive={activeTab === 'music'}
              onClick={() => setActiveTab('music')}
              icon={<Music className="w-4 h-4" />}
              label="Music Library"
            />
            <TabButton
              id="tab-starter-packs"
              controls="panel-starter-packs"
              isActive={activeTab === 'starter-packs'}
              onClick={() => setActiveTab('starter-packs')}
              icon={<Wand2 className="w-4 h-4" />}
              label="Starter Packs"
            />
          </div>
        </div>""")

    content = content.replace("""              <AnnouncementsManager />
            </div>
          )}
        </div>
      </div>
    </div>""", """              <AnnouncementsManager />
            </div>
          )}

          {activeTab === 'starter-packs' && (
            <div
              id="panel-starter-packs"
              role="tabpanel"
              aria-labelledby="tab-starter-packs"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Building Starter Packs
                </h3>
                <p className="text-slate-600">
                  Manage standard widget setups that teachers can launch instantly.
                </p>
              </div>
              <AdminStarterPackConfig />
            </div>
          )}
        </div>
      </div>
    </div>""")

    with open("components/admin/AdminSettings.tsx", "w") as f:
        f.write(content)
ADMIN_SETTINGS_EOF
python3 patch_admin_settings.py
