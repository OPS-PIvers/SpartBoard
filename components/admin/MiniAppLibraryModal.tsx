import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Save,
  Code2,
  ChevronUp,
  AppWindow,
  Building2,
  Globe,
} from 'lucide-react';
import { db, isAuthBypass } from '@/config/firebase';
import { GlobalMiniAppItem } from '@/types';
import { BUILDINGS } from '@/config/buildings';
import { Toast } from '@/components/common/Toast';

interface MiniAppLibraryModalProps {
  onClose: () => void;
}

type View = 'list' | 'editor';

const COLLECTION = 'global_mini_apps';

export const MiniAppLibraryModal: React.FC<MiniAppLibraryModalProps> = ({
  onClose,
}) => {
  const [apps, setApps] = useState<GlobalMiniAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editBuildings, setEditBuildings] = useState<string[]>([]); // empty = all
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Real-time listener for global apps
  useEffect(() => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTION),
      orderBy('order', 'asc'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setApps(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as GlobalMiniAppItem)
        );
        setLoading(false);
      },
      (err) => {
        console.error('[MiniAppLibraryModal]', err);
        showMessage('error', 'Failed to load global apps');
        setLoading(false);
      }
    );

    return unsub;
  }, [showMessage]);

  // --- Helpers ---
  const openEditor = (app?: GlobalMiniAppItem) => {
    if (app) {
      setEditingId(app.id);
      setEditTitle(app.title);
      setEditCode(app.html);
      setEditBuildings(app.buildings ?? []);
    } else {
      setEditingId(null);
      setEditTitle('');
      setEditCode('');
      setEditBuildings([]);
    }
    setView('editor');
  };

  const cancelEditor = () => {
    setView('list');
  };

  const handleSave = async () => {
    if (!editTitle.trim()) {
      showMessage('error', 'Please enter a title');
      return;
    }
    if (!editCode.trim()) {
      showMessage('error', 'Please enter some HTML code');
      return;
    }

    setSaving(true);
    try {
      const id = editingId ?? crypto.randomUUID();
      const appData: GlobalMiniAppItem = {
        id,
        title: editTitle.trim(),
        html: editCode,
        buildings: editBuildings,
        createdAt: editingId
          ? (apps.find((a) => a.id === editingId)?.createdAt ?? Date.now())
          : Date.now(),
        order: editingId
          ? (apps.find((a) => a.id === editingId)?.order ?? apps.length)
          : apps.length,
      };
      await setDoc(doc(db, COLLECTION, id), appData);
      showMessage(
        'success',
        editingId ? 'App updated' : 'App published to library'
      );
      setView('list');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (app: GlobalMiniAppItem) => {
    if (!confirm(`Delete "${app.title}" from the global library?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTION, app.id));
      showMessage('success', 'App removed');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Delete failed');
    }
  };

  const toggleBuilding = (buildingId: string) => {
    setEditBuildings((prev) =>
      prev.includes(buildingId)
        ? prev.filter((id) => id !== buildingId)
        : [...prev, buildingId]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const appToMoveUp = apps[index];
    const appToMoveDown = apps[index - 1];
    // Swap only the two affected documents — O(1) writes instead of O(n)
    const orderUp = appToMoveUp.order ?? index;
    const orderDown = appToMoveDown.order ?? index - 1;
    const batch = writeBatch(db);
    batch.update(doc(db, COLLECTION, appToMoveUp.id), { order: orderDown });
    batch.update(doc(db, COLLECTION, appToMoveDown.id), { order: orderUp });
    try {
      await batch.commit();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to reorder');
    }
  };

  // --- Building badge display ---
  const buildingLabel = (buildings: string[] | undefined): string => {
    if (!buildings || buildings.length === 0) return 'All Buildings';
    if (buildings.length === BUILDINGS.length) return 'All Buildings';
    return buildings
      .map((id) => BUILDINGS.find((b) => b.id === id)?.name ?? id)
      .join(', ');
  };

  // --- Render ---
  return (
    <div className="fixed inset-0 z-modal-nested bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-violet-100 text-violet-600 p-1.5 rounded-lg">
              <AppWindow className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">
                Global Mini App Library
              </h3>
              <p className="text-xxs text-slate-400 font-medium">
                {view === 'list'
                  ? `${apps.length} app${apps.length !== 1 ? 's' : ''} published`
                  : editingId
                    ? 'Edit app'
                    : 'New app'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {view === 'list' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Loading…
              </div>
            ) : apps.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 py-16">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <AppWindow className="w-10 h-10 stroke-slate-300" />
                </div>
                <div className="text-center">
                  <p className="font-black text-sm uppercase tracking-widest mb-1">
                    No apps yet
                  </p>
                  <p className="text-xs">
                    Create your first app to share it with teachers.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {apps.map((app, idx) => (
                  <div
                    key={app.id}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-violet-200 transition-all"
                  >
                    {/* Reorder handle / index */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Icon */}
                    <div className="bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center shrink-0 border border-violet-100 w-9 h-9 text-xxs font-black">
                      HTML
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">
                        {app.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xxs text-slate-400 font-mono">
                          {(app.html.length / 1024).toFixed(1)} KB
                        </span>
                        <span className="text-slate-200">•</span>
                        <span
                          className={`flex items-center gap-1 text-xxs font-bold ${
                            !app.buildings || app.buildings.length === 0
                              ? 'text-emerald-600'
                              : 'text-violet-600'
                          }`}
                        >
                          {!app.buildings || app.buildings.length === 0 ? (
                            <Globe className="w-3 h-3" />
                          ) : (
                            <Building2 className="w-3 h-3" />
                          )}
                          {buildingLabel(app.buildings)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditor(app)}
                        className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(app)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
          /* Editor View */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  App Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Vocabulary Flashcards"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
                />
              </div>

              {/* Building Targeting */}
              <div>
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  Available To
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Select which buildings can use this app. Leave all unchecked
                  to make it available to everyone.
                </p>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {BUILDINGS.map((building) => {
                    const isSelected = editBuildings.includes(building.id);
                    return (
                      <button
                        key={building.id}
                        type="button"
                        onClick={() => toggleBuilding(building.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{building.name}</span>
                        <span
                          className={`ml-auto text-xxs font-normal ${isSelected ? 'text-violet-200' : 'text-slate-400'}`}
                        >
                          {building.gradeLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {editBuildings.length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-bold">
                    <Globe className="w-4 h-4 shrink-0" />
                    Visible to teachers in all buildings
                  </div>
                )}
              </div>

              {/* Code Editor */}
              <div className="flex flex-col" style={{ minHeight: 240 }}>
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  <Code2 className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                  HTML Code
                </label>
                <textarea
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="flex-1 w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none leading-relaxed custom-scrollbar shadow-inner"
                  style={{ minHeight: 240 }}
                  spellCheck={false}
                  placeholder="Paste your HTML, CSS, and JS here…"
                />
                <p className="text-xxs text-slate-400 mt-1">
                  Apps run in a sandboxed iframe (null origin). Scripts run
                  freely inside the app, but it cannot access the parent
                  page&apos;s storage, DOM, or auth tokens.
                </p>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex gap-3">
              <button
                onClick={cancelEditor}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editTitle.trim() || !editCode.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-violet-200 transition-all"
              >
                {saving ? (
                  'Saving…'
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingId ? 'Update App' : 'Publish App'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer (list view only) */}
        {view === 'list' && (
          <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex items-center justify-between">
            <p className="text-xxs text-slate-400">
              Apps are available to teachers via the Mini Apps widget.
            </p>
            <button
              onClick={() => openEditor()}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-violet-200 transition-all"
            >
              <Plus className="w-4 h-4" /> New App
            </button>
          </div>
        )}
      </div>

      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
};
