import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Save,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  Zap,
  Upload,
  Camera,
  Layers,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  setDoc,
  doc,
  getDocs,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { CatalystRoutine, CatalystSet, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { Toast } from '@/components/common/Toast';
import { useDialog } from '@/context/useDialog';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface CatalystConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

const COLLECTION_PATH = [
  'artifacts',
  appId,
  'public',
  'data',
  'catalystSets',
] as const;

type ViewMode = 'sets-list' | 'set-editor' | 'routine-editor';

interface SetEditorState {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  routines: CatalystRoutine[];
  imageFile: File | null;
  imagePreview: string | null;
}

interface RoutineEditorState {
  id: string | null;
  title: string;
  description: string;
  imageUrl: string;
  widgets: Omit<WidgetData, 'id'>[];
  imageFile: File | null;
  imagePreview: string | null;
}

const EMPTY_ROUTINE_EDITOR: RoutineEditorState = {
  id: null,
  title: '',
  description: '',
  imageUrl: '',
  widgets: [],
  imageFile: null,
  imagePreview: null,
};

export const CatalystConfigurationModal: React.FC<
  CatalystConfigurationModalProps
> = ({ isOpen, onClose }) => {
  const { activeDashboard } = useDashboard();
  const { uploadCatalystImage, uploading } = useStorage();
  const { showConfirm } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);

  const [sets, setSets] = useState<CatalystSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('sets-list');

  const [setEditor, setSetEditor] = useState<SetEditorState | null>(null);
  const [routineEditor, setRoutineEditor] =
    useState<RoutineEditorState>(EMPTY_ROUTINE_EDITOR);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Fetch / Migrate sets
  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
      setSets([
        { id: 'set-1', title: 'Set 1', routines: [], createdAt: Date.now() },
        { id: 'set-2', title: 'Set 2', routines: [], createdAt: Date.now() },
        { id: 'set-3', title: 'Set 3', routines: [], createdAt: Date.now() },
        { id: 'set-4', title: 'Set 4', routines: [], createdAt: Date.now() },
      ]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = collection(db, ...COLLECTION_PATH);
    const unsub = onSnapshot(
      query(ref),
      async (snap) => {
        if (!snap.empty) {
          const items: CatalystSet[] = [];
          snap.forEach((d) =>
            items.push({ ...d.data(), id: d.id } as CatalystSet)
          );
          // Ensure we always have exactly 4 sets by padding or truncating if necessary,
          // though we assume the admin only ever sees 4.
          items.sort((a, b) => a.id.localeCompare(b.id));
          setSets(items);
          setLoading(false);
        } else {
          // Attempt migration
          const initialSets: CatalystSet[] = [
            {
              id: 'set-1',
              title: 'Set 1',
              routines: [],
              createdAt: Date.now(),
            },
            {
              id: 'set-2',
              title: 'Set 2',
              routines: [],
              createdAt: Date.now(),
            },
            {
              id: 'set-3',
              title: 'Set 3',
              routines: [],
              createdAt: Date.now(),
            },
            {
              id: 'set-4',
              title: 'Set 4',
              routines: [],
              createdAt: Date.now(),
            },
          ];

          try {
            const oldRef = collection(
              db,
              'artifacts',
              appId,
              'public',
              'data',
              'catalystRoutines'
            );
            const oldSnap = await getDocs(oldRef);
            const oldRoutines: CatalystRoutine[] = [];
            oldSnap.forEach((d) =>
              oldRoutines.push({ ...d.data(), id: d.id } as CatalystRoutine)
            );
            oldRoutines.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

            if (oldRoutines.length > 0) {
              initialSets[0].title = 'Legacy Routines';
              initialSets[0].routines = oldRoutines;
            }
          } catch (err) {
            console.error('Migration fetch failed', err);
          } finally {
            setSets(initialSets);
            setLoading(false);
          }
        }
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [isOpen]);

  const revokePreview = () => {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setView('sets-list');
      setSetEditor(null);
      setRoutineEditor(EMPTY_ROUTINE_EDITOR);
      revokePreview();
    }
  }, [isOpen]);

  const handleImageChange = (file: File, isRoutine: boolean) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showMessage('error', 'Please select a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showMessage('error', 'Image must be under 2 MB.');
      return;
    }
    revokePreview();
    const preview = URL.createObjectURL(file);
    imagePreviewUrlRef.current = preview;

    if (isRoutine) {
      setRoutineEditor((prev) => ({
        ...prev,
        imageFile: file,
        imagePreview: preview,
      }));
    } else {
      setSetEditor((prev) =>
        prev ? { ...prev, imageFile: file, imagePreview: preview } : null
      );
    }
  };

  const handleSaveSet = async () => {
    if (!setEditor) return;
    setSaving(true);
    try {
      let finalImageUrl = setEditor.imageUrl;
      if (setEditor.imageFile) {
        finalImageUrl = await uploadCatalystImage(
          setEditor.id,
          setEditor.imageFile
        );
      }
      const dataToSave: Omit<CatalystSet, 'id'> = {
        title: setEditor.title.trim(),
        description: setEditor.description.trim(),
        imageUrl: finalImageUrl.length > 0 ? finalImageUrl : undefined,
        routines: setEditor.routines,
        createdAt:
          sets.find((s) => s.id === setEditor.id)?.createdAt ?? Date.now(),
      };
      await setDoc(doc(db, ...COLLECTION_PATH, setEditor.id), dataToSave, {
        merge: true,
      });
      showMessage('success', 'Set saved');
      revokePreview();
      setView('sets-list');
      setSetEditor(null);
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to save set.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRoutine = () => {
    if (!routineEditor.title.trim()) {
      showMessage('error', 'Please enter a routine title.');
      return;
    }
    setSaving(true);
    // Since routines are nested in a set, we don't immediately upload images to Storage here.
    // Instead we upload to storage, and then update the Set in Firestore.
    const runSave = async () => {
      try {
        let finalImageUrl = routineEditor.imageUrl;
        const routineId = routineEditor.id ?? crypto.randomUUID();

        if (routineEditor.imageFile) {
          finalImageUrl = await uploadCatalystImage(
            routineId,
            routineEditor.imageFile
          );
        }

        const newRoutine: CatalystRoutine = {
          id: routineId,
          title: routineEditor.title.trim(),
          description: routineEditor.description.trim(),
          imageUrl: finalImageUrl.length > 0 ? finalImageUrl : undefined,
          widgets: routineEditor.widgets,
          createdAt: routineEditor.id
            ? (setEditor?.routines.find((r) => r.id === routineEditor.id)
                ?.createdAt ?? Date.now())
            : Date.now(),
        };

        // Update the set editor state
        setSetEditor((prev) => {
          if (!prev) return null;
          const exists = prev.routines.some((r) => r.id === newRoutine.id);
          const newRoutines = exists
            ? prev.routines.map((r) =>
                r.id === newRoutine.id ? newRoutine : r
              )
            : [...prev.routines, newRoutine];
          return { ...prev, routines: newRoutines };
        });

        showMessage('success', 'Routine applied to Set (Save Set to finalize)');
        revokePreview();
        setView('set-editor');
      } catch (err) {
        console.error(err);
        showMessage('error', 'Failed to apply routine.');
      } finally {
        setSaving(false);
      }
    };
    void runSave();
  };

  const handleDeleteRoutine = async (routineId: string) => {
    const confirmed = await showConfirm(
      `Delete this routine? It will be permanently removed when you save the set.`,
      { confirmLabel: 'Delete', cancelLabel: 'Cancel', variant: 'danger' }
    );
    if (!confirmed) return;
    setSetEditor((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        routines: prev.routines.filter((r) => r.id !== routineId),
      };
    });
  };

  const openSetEditor = (set: CatalystSet) => {
    revokePreview();
    setSetEditor({
      id: set.id,
      title: set.title,
      description: set.description ?? '',
      imageUrl: set.imageUrl ?? '',
      routines: set.routines,
      imageFile: null,
      imagePreview: null,
    });
    setView('set-editor');
  };

  const openRoutineEditor = (routine?: CatalystRoutine) => {
    revokePreview();
    if (routine) {
      setRoutineEditor({
        id: routine.id,
        title: routine.title,
        description: routine.description ?? '',
        imageUrl: routine.imageUrl ?? '',
        widgets: routine.widgets,
        imageFile: null,
        imagePreview: null,
      });
    } else {
      setRoutineEditor(EMPTY_ROUTINE_EDITOR);
    }
    setView('routine-editor');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            {view === 'set-editor' && (
              <button
                onClick={() => {
                  setView('sets-list');
                  revokePreview();
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {view === 'routine-editor' && (
              <button
                onClick={() => {
                  setView('set-editor');
                  revokePreview();
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">
                {view === 'sets-list' && 'Catalyst Sets'}
                {view === 'set-editor' && 'Edit Set'}
                {view === 'routine-editor' &&
                  (routineEditor.id ? 'Edit Routine' : 'New Routine')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading…
            </div>
          ) : view === 'sets-list' ? (
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500 mb-4">
                Catalyst allows up to 4 sets of routines. Select a set to edit
                its title, image, and manage the routines inside it.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {sets.map((set) => (
                  <button
                    key={set.id}
                    onClick={() => openSetEditor(set)}
                    className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm group hover:ring-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-left"
                    style={{ minHeight: 140 }}
                  >
                    {set.imageUrl && isSafeIconUrl(set.imageUrl) ? (
                      <img
                        src={set.imageUrl}
                        alt={set.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                        <Layers className="w-8 h-8 text-slate-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    <div className="absolute bottom-0 left-0 right-0 px-4 py-3">
                      <p className="text-white font-black uppercase tracking-widest text-sm truncate drop-shadow">
                        {set.title || `Unnamed Set`}
                      </p>
                      <p className="text-white/80 text-xs mt-0.5">
                        {set.routines.length} routine
                        {set.routines.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="absolute top-2 right-2 p-1.5 bg-white/20 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit2 className="w-4 h-4 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : view === 'set-editor' && setEditor ? (
            <div className="p-6 space-y-8">
              {/* Set Metadata */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-2">
                  Set Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Set Title
                      </label>
                      <input
                        type="text"
                        value={setEditor.title}
                        onChange={(e) =>
                          setSetEditor((p) =>
                            p ? { ...p, title: e.target.value } : null
                          )
                        }
                        placeholder="e.g. Morning Blocks"
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Description (Optional)
                      </label>
                      <textarea
                        value={setEditor.description}
                        onChange={(e) =>
                          setSetEditor((p) =>
                            p ? { ...p, description: e.target.value } : null
                          )
                        }
                        placeholder="Brief description..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none h-20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Set Image
                    </label>
                    <div
                      className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden cursor-pointer hover:border-indigo-400 transition-colors group"
                      style={{ minHeight: 140 }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {setEditor.imagePreview ||
                      (setEditor.imageUrl &&
                        isSafeIconUrl(setEditor.imageUrl)) ? (
                        <>
                          <img
                            src={setEditor.imagePreview ?? setEditor.imageUrl}
                            alt="Preview"
                            className="absolute inset-0 w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white font-bold text-sm">
                              Click to change
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                          <Upload className="w-8 h-8" />
                          <span className="text-xs font-medium">
                            Upload image
                          </span>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageChange(file, false);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Routines in this Set */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                    Routines
                  </h3>
                  <button
                    onClick={() => openRoutineEditor()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Routine
                  </button>
                </div>

                {setEditor.routines.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                    <p className="font-medium">No routines in this set yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {setEditor.routines.map((routine) => (
                      <div
                        key={routine.id}
                        className="relative bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 group"
                      >
                        <div className="font-bold text-slate-700 text-sm truncate">
                          {routine.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {routine.widgets.length} widget(s)
                        </div>

                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-slate-50 shadow-sm rounded-md border border-slate-200 p-0.5">
                          <button
                            onClick={() => openRoutineEditor(routine)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => void handleDeleteRoutine(routine.id)}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : view === 'routine-editor' ? (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Routine Title
                    </label>
                    <input
                      type="text"
                      value={routineEditor.title}
                      onChange={(e) =>
                        setRoutineEditor((p) => ({
                          ...p,
                          title: e.target.value,
                        }))
                      }
                      placeholder="e.g. Brain Break"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Description (Optional)
                    </label>
                    <textarea
                      value={routineEditor.description}
                      onChange={(e) =>
                        setRoutineEditor((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Brief description..."
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none h-20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    Button Image
                  </label>
                  <div
                    className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden cursor-pointer hover:border-indigo-400 transition-colors group"
                    style={{ minHeight: 140 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {routineEditor.imagePreview ||
                    (routineEditor.imageUrl &&
                      isSafeIconUrl(routineEditor.imageUrl)) ? (
                      <>
                        <img
                          src={
                            routineEditor.imagePreview ?? routineEditor.imageUrl
                          }
                          alt="Preview"
                          className="absolute inset-0 w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-bold text-sm">
                            Click to change
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Upload className="w-8 h-8" />
                        <span className="text-xs font-medium">
                          Upload image
                        </span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageChange(file, true);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Widget Layout
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {routineEditor.widgets.length > 0
                          ? `${routineEditor.widgets.length} widget(s) captured`
                          : 'No widgets captured yet'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Set up your board, then click &ldquo;Capture&rdquo; to
                        save that layout.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const snapshot = createBoardSnapshot(
                          (activeDashboard?.widgets ?? []).filter(
                            (w) => !w.type.startsWith('catalyst')
                          )
                        );
                        setRoutineEditor((p) => ({ ...p, widgets: snapshot }));
                        showMessage(
                          'success',
                          `Captured ${snapshot.length} widget(s)`
                        );
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      Capture Board
                    </button>
                  </div>

                  {routineEditor.widgets.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                      {routineEditor.widgets.map((w, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm"
                        >
                          {w.type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {view === 'set-editor' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            {isAuthBypass && (
              <p className="mr-auto text-xs font-medium text-amber-600">
                Saving is disabled in demo mode.
              </p>
            )}
            <button
              onClick={() => {
                setView('sets-list');
                revokePreview();
                setSetEditor(null);
              }}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSaveSet()}
              disabled={saving || uploading || isAuthBypass}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Set
            </button>
          </div>
        )}

        {view === 'routine-editor' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <button
              onClick={() => {
                setView('set-editor');
                revokePreview();
                setRoutineEditor(EMPTY_ROUTINE_EDITOR);
              }}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveRoutine}
              disabled={saving || uploading}
              className="flex items-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-colors disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Apply to Set
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
