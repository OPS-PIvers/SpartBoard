import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  X,
  Trash2,
  Building2,
  Settings,
  Library,
  Video,
  Sparkles,
} from 'lucide-react';
import { db, isAuthBypass } from '@/config/firebase';
import {
  GlobalVideoActivity,
  FeaturePermission,
  VideoActivityGlobalConfig,
} from '@/types';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { Toast } from '@/components/common/Toast';
import { useDialog } from '@/context/useDialog';
import { DockDefaultsPanel } from './DockDefaultsPanel';
import { Toggle } from '@/components/common/Toggle';

interface VideoActivityConfigurationModalProps {
  onClose: () => void;
  permission: FeaturePermission;
  onSave: (updates: Partial<FeaturePermission>) => void;
}

type View = 'list' | 'settings';

export const VideoActivityConfigurationModal: React.FC<
  VideoActivityConfigurationModalProps
> = ({ onClose, permission, onSave }) => {
  const BUILDINGS = useAdminBuildings();
  const [view, setView] = useState<View>('list');
  const [activities, setActivities] = useState<GlobalVideoActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { showConfirm } = useDialog();
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage({ type, text });
    timeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'global_video_activities'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: GlobalVideoActivity[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push({
            ...docSnap.data(),
            id: docSnap.id,
          } as GlobalVideoActivity);
        });
        setActivities(loaded);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading video activities:', error);
        showMessage('error', 'Failed to load video activities');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [showMessage]);

  const toggleBuilding = async (
    activity: GlobalVideoActivity,
    buildingId: string
  ) => {
    const currentBuildings = activity.buildings ?? [];
    const newBuildings = currentBuildings.includes(buildingId)
      ? currentBuildings.filter((id) => id !== buildingId)
      : [...currentBuildings, buildingId];

    try {
      setSavingId(activity.id);
      await setDoc(
        doc(db, 'global_video_activities', activity.id),
        { buildings: newBuildings },
        { merge: true }
      );
    } catch (error) {
      console.error('Error updating buildings:', error);
      showMessage('error', 'Failed to update buildings');
    } finally {
      setSavingId(null);
    }
  };

  const toggleAllBuildings = async (activity: GlobalVideoActivity) => {
    const currentBuildings = activity.buildings ?? [];
    if (currentBuildings.length === 0) return; // If already all buildings, do nothing

    try {
      setSavingId(activity.id);
      await setDoc(
        doc(db, 'global_video_activities', activity.id),
        { buildings: [] }, // Explicitly assign to all buildings
        { merge: true }
      );
    } catch (error) {
      console.error('Error updating buildings:', error);
      showMessage('error', 'Failed to update buildings');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (activityId: string) => {
    const confirmed = await showConfirm(
      'Are you sure you want to remove this video activity from the global library? This cannot be undone.',
      {
        title: 'Delete Global Video Activity',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );

    if (confirmed) {
      try {
        setSavingId(activityId);
        await deleteDoc(doc(db, 'global_video_activities', activityId));
        showMessage('success', 'Video activity removed successfully');
      } catch (error) {
        console.error('Error deleting activity:', error);
        showMessage('error', 'Failed to remove activity');
      } finally {
        setSavingId(null);
      }
    }
  };

  const config = (permission.config ?? {}) as VideoActivityGlobalConfig;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-modal-nested p-4 font-sans backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-red-light rounded-xl">
              <Video className="w-5 h-5 text-brand-red-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Video Activity Library
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                Manage globally available video activities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {message && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-toast">
            <Toast
              message={message.text}
              type={message.type}
              onClose={() => setMessage(null)}
            />
          </div>
        )}

        {/* View Tabs */}
        <div className="flex px-6 border-b border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
              view === 'list'
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Library className="w-4 h-4" />
            Global Library
          </button>
          <button
            onClick={() => setView('settings')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
              view === 'settings'
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            Global Settings
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 min-h-0">
          {view === 'settings' ? (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* AI Generation Settings */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">
                      AI Question Generation
                    </h3>
                    <p className="text-sm text-slate-500 font-medium">
                      Control availability of Gemini-powered activity creation
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex-1 pr-4">
                    <p className="font-bold text-slate-700 text-sm">
                      Enable AI Mode
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Allows teachers to generate questions automatically using
                      the Gemini API. This option will be hidden from non-admins
                      if disabled.
                    </p>
                  </div>
                  <Toggle
                    checked={config.aiEnabled ?? true}
                    onChange={(checked) =>
                      onSave({ config: { ...config, aiEnabled: checked } })
                    }
                    size="md"
                  />
                </div>
              </div>

              <DockDefaultsPanel
                config={{ dockDefaults: config.dockDefaults ?? {} }}
                onChange={(dockDefaults) =>
                  onSave({ config: { ...config, dockDefaults } })
                }
              />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="bg-brand-blue-light/20 border border-brand-blue-primary/20 rounded-xl p-4 flex gap-3 mb-6">
                <Library className="w-5 h-5 text-brand-blue-primary shrink-0 mt-0.5" />
                <div className="text-sm text-brand-blue-dark leading-relaxed">
                  <p className="font-bold mb-1">How the Global Library Works</p>
                  <p className="opacity-90">
                    Activities in this library are available to all teachers in
                    the assigned buildings. To add an activity here, a teacher
                    or admin must create it in the Video Activity widget and
                    share it to the global library.
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-500">
                  <div className="animate-spin w-8 h-8 border-4 border-brand-blue-primary border-t-transparent rounded-full mx-auto mb-4" />
                  Loading activities...
                </div>
              ) : activities.length === 0 ? (
                <div className="py-12 text-center bg-white border border-slate-200 rounded-xl">
                  <Video className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium mb-1">
                    No global video activities found
                  </p>
                  <p className="text-sm text-slate-400">
                    Activities shared to the global library will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className={`bg-white border rounded-xl p-4 transition-all ${
                        savingId === activity.id
                          ? 'border-brand-blue-primary/50 opacity-70'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-800 text-lg truncate">
                            {activity.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-xs font-medium text-slate-500">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-red-primary" />
                              {activity.questionCount} Questions
                            </span>
                            <span className="text-slate-300">•</span>
                            <a
                              href={activity.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-blue-primary hover:underline truncate"
                            >
                              {activity.youtubeUrl}
                            </a>
                          </div>

                          {/* Building Assignment */}
                          <div className="mt-4">
                            <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                              <Building2 className="w-3 h-3" /> Target Buildings
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => toggleAllBuildings(activity)}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                                  (activity.buildings ?? []).length === 0
                                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                ALL BUILDINGS
                              </button>
                              {BUILDINGS.map((building) => (
                                <button
                                  key={building.id}
                                  onClick={() =>
                                    toggleBuilding(activity, building.id)
                                  }
                                  className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                                    (activity.buildings ?? []).includes(
                                      building.id
                                    )
                                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  {building.gradeLabel}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            onClick={() => handleDelete(activity.id)}
                            disabled={savingId === activity.id}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete activity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
