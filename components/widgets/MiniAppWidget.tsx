import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  MiniAppItem,
  MiniAppConfig,
  GlobalMiniAppItem,
} from '@/types';
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Save,
  X,
  GripVertical,
  LayoutGrid,
  Download,
  Upload,
  Box,
  Code2,
  Sparkles,
  Loader2,
  Globe,
  BookDown,
} from 'lucide-react';
import { generateMiniAppCode } from '@/utils/ai';
import { WidgetLayout } from './WidgetLayout';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/context/useAuth';
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
import { db } from '@/config/firebase';

// --- CONSTANTS ---
const STORAGE_KEY = 'spartboard_miniapps_library';

// --- SORTABLE ITEM COMPONENT ---
interface SortableItemProps {
  app: MiniAppItem;
  onRun: (app: MiniAppItem) => void;
  onEdit: (app: MiniAppItem) => void;
  onDelete: (id: string) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  app,
  onRun,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        padding: 'min(12px, 2.5cqmin)',
        gap: 'min(12px, 2.5cqmin)',
      }}
      className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex items-center"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="text-slate-400 cursor-grab hover:text-slate-600 touch-none"
      >
        <GripVertical
          style={{
            width: 'min(16px, 4cqmin)',
            height: 'min(16px, 4cqmin)',
          }}
        />
      </div>

      {/* Icon & Title */}
      <div
        className="bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 border border-indigo-100"
        style={{
          width: 'min(40px, 10cqmin)',
          height: 'min(40px, 10cqmin)',
          fontSize: 'min(12px, 3cqmin)',
        }}
      >
        HTML
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className="text-slate-700 font-bold truncate"
          style={{ fontSize: 'min(14px, 3.5cqmin)' }}
        >
          {app.title}
        </h4>
        <div
          className="text-slate-500 font-mono"
          style={{ fontSize: 'min(10px, 2.5cqmin)' }}
        >
          {(app.html.length / 1024).toFixed(1)} KB
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center" style={{ gap: 'min(4px, 1cqmin)' }}>
        <button
          onClick={() => onRun(app)}
          className="bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
          style={{ padding: 'min(8px, 2cqmin)' }}
          title="Run App"
        >
          <Play
            className="fill-current"
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        <div
          className="bg-slate-200"
          style={{
            width: '1px',
            height: 'min(24px, 6cqmin)',
            marginLeft: 'min(4px, 1cqmin)',
            marginRight: 'min(4px, 1cqmin)',
          }}
        ></div>
        <button
          onClick={() => onEdit(app)}
          className="text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
          style={{ padding: 'min(8px, 2cqmin)' }}
          title="Edit"
        >
          <Pencil
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        <button
          onClick={() => onDelete(app.id)}
          className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          style={{ padding: 'min(8px, 2cqmin)' }}
          title="Delete"
        >
          <Trash2
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
      </div>
    </div>
  );
};

// --- GLOBAL APP ROW (read-only, no drag) ---
interface GlobalAppRowProps {
  app: GlobalMiniAppItem;
  onRun: (app: MiniAppItem) => void;
  onSaveToLibrary: (app: GlobalMiniAppItem) => void;
  isSaving: boolean;
}

const GlobalAppRow: React.FC<GlobalAppRowProps> = ({
  app,
  onRun,
  onSaveToLibrary,
  isSaving,
}) => (
  <div
    style={{ padding: 'min(10px, 2cqmin)', gap: 'min(10px, 2cqmin)' }}
    className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all flex items-center"
  >
    <div
      className="bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center shrink-0 border border-violet-100 font-black"
      style={{
        width: 'min(36px, 9cqmin)',
        height: 'min(36px, 9cqmin)',
        fontSize: 'min(10px, 2.5cqmin)',
      }}
    >
      HTML
    </div>
    <div className="flex-1 min-w-0">
      <h4
        className="text-slate-700 font-bold truncate"
        style={{ fontSize: 'min(13px, 3.2cqmin)' }}
      >
        {app.title}
      </h4>
      <div
        className="text-slate-500 font-mono"
        style={{ fontSize: 'min(9px, 2.2cqmin)' }}
      >
        {(app.html.length / 1024).toFixed(1)} KB
      </div>
    </div>
    <div className="flex items-center" style={{ gap: 'min(4px, 1cqmin)' }}>
      <button
        onClick={() => onRun(app)}
        className="bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
        style={{ padding: 'min(7px, 1.8cqmin)' }}
        title="Run App"
      >
        <Play
          className="fill-current"
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </button>
      <button
        onClick={() => onSaveToLibrary(app)}
        disabled={isSaving}
        className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
        style={{ padding: 'min(7px, 1.8cqmin)' }}
        title="Save to My Library"
      >
        <BookDown
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </button>
    </div>
  </div>
);

// --- MAIN WIDGET COMPONENT ---
export const MiniAppWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addToast } = useDashboard();
  const { canAccessFeature, user, selectedBuildings } = useAuth();
  const config = widget.config as MiniAppConfig;
  const { activeApp } = config;

  const [library, setLibrary] = useState<MiniAppItem[]>([]);
  const [globalLibrary, setGlobalLibrary] = useState<GlobalMiniAppItem[]>([]);
  const [activeTab, setActiveTab] = useState<'personal' | 'global'>('personal');
  const [savingGlobalId, setSavingGlobalId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCode, setEditCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dnd Kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Firestore Sync & Migration
  useEffect(() => {
    if (!user) return;

    const appsRef = collection(db, 'users', user.uid, 'miniapps');
    const q = query(
      appsRef,
      orderBy('order', 'asc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as MiniAppItem
      );
      setLibrary(apps);

      // Migration check: if Firestore is empty but localStorage has data
      if (apps.length === 0) {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          try {
            const parsed = JSON.parse(local) as MiniAppItem[];
            if (parsed.length > 0) {
              console.warn(
                '[MiniAppWidget] Migrating local apps to Firestore...'
              );
              const batch = writeBatch(db);
              parsed.forEach((app, index) => {
                const docRef = doc(appsRef, app.id);
                batch.set(docRef, { ...app, order: index });
              });
              void batch.commit().then(() => {
                localStorage.removeItem(STORAGE_KEY);
                addToast('Migrated local apps to cloud', 'success');
              });
            }
          } catch (e) {
            console.error('[MiniAppWidget] Migration failed', e);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [user, addToast]);

  // Global library listener — subscribes to all published mini apps and filters
  // client-side. An app is visible when its `buildings` array is empty/absent
  // (available to everyone) OR contains at least one of the teacher's buildings.
  // When the teacher has no building context, only untagged apps are shown.
  useEffect(() => {
    const q = query(
      collection(db, 'global_mini_apps'),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const allApps = snap.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as GlobalMiniAppItem
      );
      const filtered = allApps.filter((app) => {
        // Treat absent or empty buildings as "all buildings"
        const appBuildings = Array.isArray(app.buildings) ? app.buildings : [];
        const isGlobal = appBuildings.length === 0;
        if (isGlobal) return true;
        if (selectedBuildings.length === 0) return false;
        return appBuildings.some((b) => selectedBuildings.includes(b));
      });
      setGlobalLibrary(filtered);
    });

    return () => unsubscribe();
  }, [selectedBuildings]);

  // --- HANDLERS ---

  const handleRun = (app: MiniAppItem) => {
    updateWidget(widget.id, {
      config: { ...config, activeApp: app },
    });
  };

  const handleCloseActive = () => {
    updateWidget(widget.id, {
      config: { ...config, activeApp: null },
    });
  };

  const handleCreate = () => {
    setEditingId(null);
    setEditTitle('');
    setEditCode('');
    setView('editor');
    setShowPromptInput(false);
    setPrompt('');
  };

  const handleEdit = (app: MiniAppItem) => {
    setEditingId(app.id);
    setEditTitle(app.title);
    setEditCode(app.html);
    setView('editor');
    setShowPromptInput(false);
    setPrompt('');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      const result = await generateMiniAppCode(prompt);
      setEditTitle(result.title);
      setEditCode(result.html);
      setShowPromptInput(false);
      setPrompt('');
      addToast('App generated successfully!', 'success');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Failed to generate app',
        'error'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (confirm('Delete this app from your library?')) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'miniapps', id));
        addToast('App deleted', 'info');
      } catch (err) {
        console.error(err);
        addToast('Delete failed', 'error');
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!editTitle.trim()) {
      addToast('Please enter a title', 'error');
      return;
    }

    try {
      const id = editingId ?? (crypto.randomUUID() as string);
      const appsRef = collection(db, 'users', user.uid, 'miniapps');
      const docRef = doc(appsRef, id);

      const appData: MiniAppItem = {
        id,
        title: editTitle,
        html: editCode,
        createdAt: editingId
          ? (library.find((a) => a.id === editingId)?.createdAt ?? Date.now())
          : Date.now(),
        order: editingId
          ? (library.find((a) => a.id === editingId)?.order ?? 0)
          : library.length > 0
            ? Math.min(...library.map((a) => a.order ?? 0)) - 1
            : 0,
      };

      await setDoc(docRef, appData);
      setView('list');
      addToast('App saved to cloud', 'success');
    } catch (err) {
      console.error(err);
      addToast('Save failed', 'error');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!user || !over || active.id === over.id) return;

    const oldIndex = library.findIndex((a) => a.id === active.id);
    const newIndex = library.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(library, oldIndex, newIndex);

    const batch = writeBatch(db);
    reordered.forEach((app, index) => {
      const docRef = doc(db, 'users', user.uid, 'miniapps', app.id);
      batch.set(docRef, { ...app, order: index });
    });

    try {
      await batch.commit();
    } catch (err) {
      console.error('Failed to save reorder', err);
      addToast('Failed to save order', 'error');
    }
  };

  const handleSaveToLibrary = async (app: GlobalMiniAppItem) => {
    if (!user) return;
    if (library.some((a) => a.title === app.title && a.html === app.html)) {
      addToast('App is already in your library', 'info');
      return;
    }
    setSavingGlobalId(app.id);
    try {
      const id = crypto.randomUUID() as string;
      const appsRef = collection(db, 'users', user.uid, 'miniapps');
      const appData: MiniAppItem = {
        id,
        title: app.title,
        html: app.html,
        createdAt: Date.now(),
        order: library.length,
      };
      await setDoc(doc(appsRef, id), appData);
      addToast(`"${app.title}" added to your library`, 'success');
      setActiveTab('personal');
    } catch (err) {
      console.error(err);
      addToast('Failed to save app', 'error');
    } finally {
      setSavingGlobalId(null);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spartboard-apps-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Library exported successfully', 'success');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as unknown;
        if (!Array.isArray(imported)) throw new Error('Invalid format');

        const batch = writeBatch(db);
        const appsRef = collection(db, 'users', user.uid, 'miniapps');

        let count = 0;
        imported.forEach((item: unknown, index) => {
          if (typeof item !== 'object' || item === null) return;
          const i = item as Record<string, unknown>;
          if (typeof i.html !== 'string') return;

          const id = crypto.randomUUID() as string;
          const appData: MiniAppItem = {
            id,
            title:
              typeof i.title === 'string' && i.title
                ? i.title.slice(0, 100)
                : 'Untitled App',
            html: i.html,
            createdAt: Date.now(),
            order: index - imported.length, // Put at start
          };
          batch.set(doc(appsRef, id), appData);
          count++;
        });

        if (count > 0) {
          await batch.commit();
          addToast(`Imported ${count} apps`, 'success');
        }
      } catch (err) {
        console.error(err);
        addToast('Failed to import: Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- RENDER: RUNNING MODE ---
  if (activeApp) {
    return (
      <WidgetLayout
        padding="p-0"
        header={
          <div
            className="w-full bg-slate-50/50 flex items-center justify-center border-b border-slate-100/50 cursor-move hover:bg-slate-100/80 transition-colors group/app-header"
            style={{ height: 'min(16px, 3.5cqmin)' }}
          >
            <div
              className="bg-slate-300/50 rounded-full group-hover/app-header:bg-slate-400/80 transition-colors"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(4px, 1cqmin)',
              }}
            />
            <div className="absolute top-1 right-2 z-10">
              <button
                onClick={handleCloseActive}
                className="bg-slate-900/80 backdrop-blur-sm hover:bg-slate-900 text-white rounded-lg uppercase tracking-wider flex items-center shadow-lg border border-slate-700 font-black transition-all"
                style={{
                  padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                  fontSize: 'min(10px, 2.5cqmin)',
                  gap: 'min(6px, 1.5cqmin)',
                }}
              >
                <LayoutGrid
                  style={{
                    width: 'min(10px, 2.5cqmin)',
                    height: 'min(10px, 2.5cqmin)',
                  }}
                />{' '}
                Library
              </button>
            </div>
          </div>
        }
        content={
          <div className="w-full h-full flex flex-col relative overflow-hidden">
            <iframe
              srcDoc={activeApp.html}
              className="flex-1 w-full border-none bg-white" // Keep bg-white for iframe content visibility
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              title={activeApp.title}
            />
          </div>
        }
      />
    );
  }

  // --- RENDER: EDITOR MODE ---
  if (view === 'editor') {
    return (
      <WidgetLayout
        padding="p-0"
        header={
          <div className="p-4 flex items-center justify-between">
            <h3 className="text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2 font-black">
              <Code2 className="w-4 h-4 text-indigo-500" />
              {editingId ? 'Edit App' : 'New Mini-App'}
            </h3>
            <button
              onClick={() => setView('list')}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        }
        content={
          <div className="flex-1 w-full h-full flex flex-col p-4 space-y-4 overflow-y-auto custom-scrollbar relative">
            {showPromptInput && (
              <div
                className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowPromptInput(false);
                }}
              >
                <div className="w-full max-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-indigo-600 flex items-center gap-2 uppercase tracking-tight">
                      <Sparkles className="w-5 h-5" /> Magic Generator
                    </h4>
                    <button
                      onClick={() => setShowPromptInput(false)}
                      className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                      aria-label="Close Magic Generator"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest opacity-60">
                    Describe the mini-app you want to build.
                  </p>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. A team randomizer for 5 groups with a spinning wheel animation and confetti effect."
                    className="w-full h-32 p-4 bg-white border-2 border-indigo-100 rounded-2xl text-sm text-indigo-900 placeholder-indigo-300 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
                    autoFocus
                    aria-label="Describe your mini-app"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />{' '}
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Generate Code
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  App Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Lunch Randomizer"
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                />
              </div>
              {canAccessFeature('gemini-functions') && (
                <div className="pt-5">
                  <button
                    onClick={() => setShowPromptInput(true)}
                    className="h-[46px] px-4 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 active:scale-95"
                    title="Generate with AI"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">Magic</span>
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col min-h-[250px]">
              <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                HTML Code
              </label>
              <textarea
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                className="flex-1 w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed custom-scrollbar shadow-inner"
                spellCheck={false}
                placeholder="Paste your HTML, CSS, and JS here..."
              />
            </div>
          </div>
        }
        footer={
          <div className="p-4 flex gap-3">
            <button
              onClick={() => setView('list')}
              className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors border border-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Save className="w-4 h-4" /> Save App
            </button>
          </div>
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="shrink-0"
          style={{ padding: 'min(16px, 3.5cqmin) min(20px, 4cqmin) 0' }}
        >
          {/* Title row */}
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 'min(10px, 2.5cqmin)' }}
          >
            <h2
              className="font-black text-slate-800 tracking-tight uppercase"
              style={{ fontSize: 'min(18px, 4.5cqmin)' }}
            >
              App Library
            </h2>
            {activeTab === 'personal' && (
              <button
                onClick={handleCreate}
                className="bg-white text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all shadow-sm border border-slate-200 hover:border-indigo-200 active:scale-95"
                style={{ padding: 'min(10px, 2.2cqmin)' }}
                title="Create New App"
              >
                <Plus
                  style={{
                    width: 'min(22px, 5.5cqmin)',
                    height: 'min(22px, 5.5cqmin)',
                  }}
                />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div
            className="flex bg-slate-100 rounded-xl p-0.5"
            style={{
              gap: 'min(2px, 0.5cqmin)',
              marginBottom: 'min(2px, 0.5cqmin)',
            }}
          >
            <button
              onClick={() => setActiveTab('personal')}
              className={`flex-1 flex items-center justify-center rounded-lg transition-all font-black uppercase tracking-widest ${
                activeTab === 'personal'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              style={{
                fontSize: 'min(10px, 2.5cqmin)',
                padding: 'min(6px, 1.5cqmin)',
                gap: 'min(4px, 1cqmin)',
              }}
            >
              My Apps
              {library.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 ${activeTab === 'personal' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}
                  style={{ fontSize: 'min(9px, 2.2cqmin)' }}
                >
                  {library.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('global')}
              className={`flex-1 flex items-center justify-center rounded-lg transition-all font-black uppercase tracking-widest ${
                activeTab === 'global'
                  ? 'bg-white text-violet-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              style={{
                fontSize: 'min(10px, 2.5cqmin)',
                padding: 'min(6px, 1.5cqmin)',
                gap: 'min(4px, 1cqmin)',
              }}
            >
              <Globe
                style={{
                  width: 'min(10px, 2.5cqmin)',
                  height: 'min(10px, 2.5cqmin)',
                }}
              />
              Global
              {globalLibrary.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 ${activeTab === 'global' ? 'bg-violet-100 text-violet-600' : 'bg-slate-200 text-slate-500'}`}
                  style={{ fontSize: 'min(9px, 2.2cqmin)' }}
                >
                  {globalLibrary.length}
                </span>
              )}
            </button>
          </div>
        </div>
      }
      content={
        <div
          className="flex-1 w-full h-full overflow-y-auto bg-transparent custom-scrollbar flex flex-col"
          style={{
            padding: 'min(12px, 3cqmin) min(16px, 3.5cqmin)',
            gap: 'min(8px, 2cqmin)',
          }}
        >
          {activeTab === 'personal' ? (
            <>
              {/* Personal library sub-header links */}
              <div
                className="flex items-center"
                style={{
                  gap: 'min(12px, 3cqmin)',
                  marginBottom: 'min(4px, 1cqmin)',
                }}
              >
                <button
                  onClick={handleExport}
                  className="font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center transition-colors"
                  style={{
                    fontSize: 'min(10px, 2.5cqmin)',
                    gap: 'min(4px, 1cqmin)',
                  }}
                >
                  <Download
                    style={{
                      width: 'min(12px, 3cqmin)',
                      height: 'min(12px, 3cqmin)',
                    }}
                  />
                  Export
                </button>
                <span
                  className="text-slate-200 font-bold"
                  style={{ fontSize: 'min(10px, 2.5cqmin)' }}
                >
                  •
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center transition-colors"
                  style={{
                    fontSize: 'min(10px, 2.5cqmin)',
                    gap: 'min(4px, 1cqmin)',
                  }}
                >
                  <Upload
                    style={{
                      width: 'min(12px, 3cqmin)',
                      height: 'min(12px, 3cqmin)',
                    }}
                  />
                  Import
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImport}
                  accept=".json"
                  className="hidden"
                />
              </div>

              {library.length === 0 ? (
                <div
                  className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40"
                  style={{
                    gap: 'min(16px, 3.5cqmin)',
                    paddingTop: 'min(32px, 7cqmin)',
                    paddingBottom: 'min(32px, 7cqmin)',
                  }}
                >
                  <div
                    className="bg-white rounded-3xl border border-slate-200 shadow-sm"
                    style={{ padding: 'min(20px, 4cqmin)' }}
                  >
                    <Box
                      className="stroke-slate-300"
                      style={{
                        width: 'min(40px, 10cqmin)',
                        height: 'min(40px, 10cqmin)',
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p
                      className="font-black uppercase tracking-widest"
                      style={{
                        fontSize: 'min(14px, 3.5cqmin)',
                        marginBottom: 'min(4px, 1cqmin)',
                      }}
                    >
                      No apps saved yet
                    </p>
                    <p
                      className="font-bold uppercase tracking-tighter"
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
                    >
                      Import a file or create your first mini-app.
                    </p>
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={library.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {library.map((app) => (
                      <SortableItem
                        key={app.id}
                        app={app}
                        onRun={handleRun}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </>
          ) : (
            /* Global library tab */
            <>
              {globalLibrary.length === 0 ? (
                <div
                  className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40"
                  style={{
                    gap: 'min(16px, 3.5cqmin)',
                    paddingTop: 'min(32px, 7cqmin)',
                    paddingBottom: 'min(32px, 7cqmin)',
                  }}
                >
                  <div
                    className="bg-white rounded-3xl border border-slate-200 shadow-sm"
                    style={{ padding: 'min(20px, 4cqmin)' }}
                  >
                    <Globe
                      className="stroke-slate-300"
                      style={{
                        width: 'min(40px, 10cqmin)',
                        height: 'min(40px, 10cqmin)',
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p
                      className="font-black uppercase tracking-widest"
                      style={{
                        fontSize: 'min(14px, 3.5cqmin)',
                        marginBottom: 'min(4px, 1cqmin)',
                      }}
                    >
                      No shared apps yet
                    </p>
                    <p
                      className="font-bold uppercase tracking-tighter"
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
                    >
                      Your admin has not published any apps yet.
                    </p>
                  </div>
                </div>
              ) : (
                globalLibrary.map((app) => (
                  <GlobalAppRow
                    key={app.id}
                    app={app}
                    onRun={handleRun}
                    onSaveToLibrary={handleSaveToLibrary}
                    isSaving={savingGlobalId === app.id}
                  />
                ))
              )}
            </>
          )}
        </div>
      }
      footer={
        <div
          className="font-black text-slate-400 text-center uppercase tracking-widest shrink-0"
          style={{
            padding: 'min(12px, 2.5cqmin)',
            fontSize: 'min(10px, 2.5cqmin)',
          }}
        >
          {activeTab === 'personal'
            ? 'Drag to reorder • Runs in secure sandbox'
            : 'Shared by your admin • Runs in secure sandbox'}
        </div>
      }
    />
  );
};
