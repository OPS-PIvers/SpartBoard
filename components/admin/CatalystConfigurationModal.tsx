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
  ImageOff,
  Camera,
  Package,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { CatalystRoutine, WidgetData } from '@/types';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { Toast } from '@/components/common/Toast';
import { useDialog } from '@/context/useDialog';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';

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
  'catalystRoutines',
] as const;

type ViewMode = 'list' | 'editor';

interface EditorState {
  id: string | null; // null = new
  title: string;
  imageUrl: string;
  widgets: Omit<WidgetData, 'id'>[];
  imageFile: File | null;
  imagePreview: string | null;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: '',
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

  const [routines, setRoutines] = useState<CatalystRoutine[]>([]);
  const [loadingRoutines, setLoadingRoutines] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Subscribe to Firestore routines
  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
      setRoutines([]);
      setLoadingRoutines(false);
      return;
    }

    setLoadingRoutines(true);
    const ref = collection(db, ...COLLECTION_PATH);
    const unsub = onSnapshot(
      query(ref),
      (snap) => {
        const items: CatalystRoutine[] = [];
        snap.forEach((d) =>
          items.push({ ...d.data(), id: d.id } as CatalystRoutine)
        );
        items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        setRoutines(items);
        setLoadingRoutines(false);
      },
      () => setLoadingRoutines(false)
    );
    return () => unsub();
  }, [isOpen]);

  // Revoke any lingering object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
        imagePreviewUrlRef.current = null;
      }
    };
  }, []);

  // Reset to list view when modal closes and revoke any pending preview URL
  useEffect(() => {
    if (!isOpen) {
      setView('list');
      setEditor(EMPTY_EDITOR);
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
        imagePreviewUrlRef.current = null;
      }
    }
  }, [isOpen]);

  const revokePreview = () => {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
  };

  const openCreate = () => {
    revokePreview();
    setEditor(EMPTY_EDITOR);
    setView('editor');
  };

  const openEdit = (routine: CatalystRoutine) => {
    revokePreview();
    setEditor({
      id: routine.id,
      title: routine.title,
      imageUrl: routine.imageUrl ?? '',
      widgets: routine.widgets,
      imageFile: null,
      imagePreview: null,
    });
    setView('editor');
  };

  const handleCaptureBoard = () => {
    const widgets = activeDashboard?.widgets ?? [];
    // Filter out all catalyst-related widget types to prevent self-referential layouts
    const snapshot = createBoardSnapshot(
      widgets.filter((w) => !w.type.startsWith('catalyst'))
    );
    setEditor((e) => ({ ...e, widgets: snapshot }));
    showMessage('success', `Captured ${snapshot.length} widget(s)`);
  };

  const handleImageChange = (file: File) => {
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
    setEditor((e) => ({ ...e, imageFile: file, imagePreview: preview }));
  };

  const handleSave = async () => {
    if (!editor.title.trim()) {
      showMessage('error', 'Please enter a routine title.');
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = editor.imageUrl;
      const ref = collection(db, ...COLLECTION_PATH);

      if (editor.id) {
        // Updating existing routine — use existing ID for image path consistency
        if (editor.imageFile) {
          finalImageUrl = await uploadCatalystImage(
            editor.id,
            editor.imageFile
          );
        }
        const data: Omit<CatalystRoutine, 'id'> = {
          title: editor.title.trim(),
          imageUrl: finalImageUrl.length > 0 ? finalImageUrl : undefined,
          widgets: editor.widgets,
          createdAt:
            routines.find((r) => r.id === editor.id)?.createdAt ?? Date.now(),
        };
        await updateDoc(doc(db, ...COLLECTION_PATH, editor.id), { ...data });
        showMessage('success', 'Routine updated');
      } else {
        // Creating new routine — pre-generate a doc ref so the storage path and
        // Firestore document ID are the same, preventing orphaned images.
        const newDocRef = doc(ref);
        if (editor.imageFile) {
          finalImageUrl = await uploadCatalystImage(
            newDocRef.id,
            editor.imageFile
          );
        }
        const data: Omit<CatalystRoutine, 'id'> = {
          title: editor.title.trim(),
          imageUrl: finalImageUrl.length > 0 ? finalImageUrl : undefined,
          widgets: editor.widgets,
          createdAt: Date.now(),
        };
        await setDoc(newDocRef, data);
        showMessage('success', 'Routine created');
      }

      revokePreview();
      setView('list');
      setEditor(EMPTY_EDITOR);
    } catch (err) {
      console.error('Failed to save routine:', err);
      showMessage('error', 'Failed to save routine.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (routine: CatalystRoutine) => {
    const confirmed = await showConfirm(
      `Delete "${routine.title}"? This cannot be undone.`,
      { confirmLabel: 'Delete', cancelLabel: 'Cancel', variant: 'danger' }
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, ...COLLECTION_PATH, routine.id));
      showMessage('success', 'Routine deleted');
    } catch {
      showMessage('error', 'Failed to delete routine.');
    }
  };

  if (!isOpen) return null;

  const previewSrc =
    editor.imagePreview ??
    (editor.imageUrl && isSafeIconUrl(editor.imageUrl)
      ? editor.imageUrl
      : null);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            {view === 'editor' && (
              <button
                onClick={() => {
                  setView('list');
                  setEditor(EMPTY_EDITOR);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">
                {view === 'list'
                  ? 'Catalyst Routines'
                  : editor.id
                    ? 'Edit Routine'
                    : 'New Routine'}
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
          {view === 'list' ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {routines.length} routine{routines.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Routine
                </button>
              </div>

              {loadingRoutines ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading…
                </div>
              ) : routines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl">
                  <Package className="w-10 h-10 opacity-40" />
                  <div>
                    <p className="font-bold text-slate-500">No routines yet</p>
                    <p className="text-sm mt-1">
                      Click &ldquo;New Routine&rdquo; to create your first one.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {routines.map((routine) => (
                    <div
                      key={routine.id}
                      className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm group"
                      style={{ minHeight: 140 }}
                    >
                      {/* Image / placeholder */}
                      {routine.imageUrl && isSafeIconUrl(routine.imageUrl) ? (
                        <img
                          src={routine.imageUrl}
                          alt={routine.title}
                          className="absolute inset-0 w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                          <ImageOff className="w-8 h-8 text-slate-300" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                      {/* Title footer */}
                      <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
                        <p className="text-white font-black uppercase tracking-widest text-xs truncate drop-shadow">
                          {routine.title}
                        </p>
                        <p className="text-white/70 text-xs">
                          {routine.widgets.length} widget
                          {routine.widgets.length !== 1 ? 's' : ''}
                        </p>
                      </div>

                      {/* Action overlay on hover */}
                      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <button
                          onClick={() => openEdit(routine)}
                          className="p-2 bg-white rounded-lg shadow text-slate-700 hover:bg-slate-50 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(routine)}
                          className="p-2 bg-white rounded-lg shadow text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Editor view */
            <div className="p-6 space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Routine Title
                </label>
                <input
                  type="text"
                  value={editor.title}
                  onChange={(e) =>
                    setEditor((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="e.g. Morning Meeting"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Button Image
                </label>
                <div
                  className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden cursor-pointer hover:border-indigo-400 transition-colors group"
                  style={{ minHeight: 180 }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file?.type.startsWith('image/'))
                      handleImageChange(file);
                  }}
                >
                  {previewSrc ? (
                    <>
                      <img
                        src={previewSrc}
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
                      <span className="text-sm font-medium">
                        Click or drag to upload image
                      </span>
                      <span className="text-xs">PNG, JPG, WEBP</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageChange(file);
                    }}
                  />
                </div>
                {uploading && (
                  <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading image…
                  </p>
                )}
              </div>

              {/* Widget capture */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Widget Layout
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {editor.widgets.length > 0
                          ? `${editor.widgets.length} widget${editor.widgets.length !== 1 ? 's' : ''} captured`
                          : 'No widgets captured yet'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Set up your board, then click &ldquo;Capture&rdquo; to
                        save that layout as this routine.
                      </p>
                    </div>
                    <button
                      onClick={handleCaptureBoard}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      Capture Board
                    </button>
                  </div>

                  {editor.widgets.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200">
                      {editor.widgets.map((w, i) => (
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
          )}
        </div>

        {/* Footer */}
        {view === 'editor' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            {isAuthBypass && (
              <p className="mr-auto text-xs font-medium text-amber-600">
                Saving is disabled in demo mode.
              </p>
            )}
            <button
              onClick={() => {
                revokePreview();
                setView('list');
                setEditor(EMPTY_EDITOR);
              }}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || uploading || isAuthBypass}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {editor.id ? 'Update Routine' : 'Save Routine'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
