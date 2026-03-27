import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  MiniAppItem,
  MiniAppConfig,
  GlobalMiniAppItem,
  WidgetComponentProps,
} from '@/types';
import {
  Plus,
  LayoutGrid,
  Download,
  Upload,
  Box,
  Globe,
  Save,
  X,
  Cast,
  Radio,
  Copy,
  Check,
} from 'lucide-react';
import { generateMiniAppCode } from '@/utils/ai';
import { WidgetLayout } from '../WidgetLayout';
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
} from '@dnd-kit/sortable';
import { useAuth } from '@/context/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { SortableItem } from './components/SortableItem';
import { GlobalAppRow } from './components/GlobalAppRow';
import { MiniAppEditor } from './components/MiniAppEditor';
import { useMiniAppSync } from './hooks/useMiniAppSync';
import { useMiniAppGlobalConfig } from './hooks/useMiniAppGlobalConfig';
import { useDialog } from '@/context/useDialog';

// --- MAIN WIDGET COMPONENT ---
export const MiniAppWidget: React.FC<WidgetComponentProps> = ({
  widget,
  isStudentView,
  studentPin,
}) => {
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const config = (widget.config ?? {}) as MiniAppConfig;
  const activeApp = config.activeApp ?? null;
  const activeAppId = activeApp?.id;

  const { session, startSession, endSession } = useLiveSession(
    user?.uid,
    'teacher'
  );
  const isLive = session?.isActive && session?.activeWidgetId === widget.id;

  const { library, globalLibrary } = useMiniAppSync(addToast);
  const { globalConfig } = useMiniAppGlobalConfig();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 2. STUDENT LISTENER: Listen for iframe messages and POST to Apps Script
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      // SECURITY: Verify that the message originated from the specific iframe managed by this widget instance.
      // This prevents spoofing from other iframes or malicious scripts, and ensures that multiple
      // widgets on the same dashboard don't trigger each other's submission logic.
      if (event.source !== iframeRef.current?.contentWindow) return;

      const data = event.data as { type?: string; payload?: unknown } | null;
      if (
        data?.type === 'SPART_MINIAPP_RESULT' &&
        globalConfig?.submissionUrl
      ) {
        try {
          await fetch(globalConfig.submissionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sheetId: config.googleSheetId,
              studentPin: studentPin ?? 'Anonymous',
              data: data.payload,
            }),
          });
        } catch (error) {
          console.error('Submission failed', error);
        }
      }
    },
    [globalConfig?.submissionUrl, config.googleSheetId, studentPin]
  );

  useEffect(() => {
    if (
      !isStudentView ||
      !config.collectResults ||
      !config.googleSheetId ||
      !globalConfig?.submissionUrl
    )
      return;

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    isStudentView,
    config.collectResults,
    config.googleSheetId,
    globalConfig?.submissionUrl,
    handleMessage,
  ]);

  const [activeTab, setActiveTab] = useState<'personal' | 'global'>('personal');
  const [savingGlobalId, setSavingGlobalId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/join?code=${code}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCode, setEditCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unsaved paste state: shown as an overlay when activeAppUnsaved is true
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [pendingSaveTitle, setPendingSaveTitle] = useState('');

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

  // --- HANDLERS ---

  const handleToggleLive = async (app?: MiniAppItem) => {
    try {
      if (isLive) {
        await endSession();
      } else {
        // If an app was clicked directly from the list, run it first
        if (app && activeApp?.id !== app.id) {
          updateWidget(widget.id, {
            config: { ...config, activeApp: app },
          });
        }

        await startSession(
          widget.id,
          widget.type,
          app ? { ...config, activeApp: app } : widget.config,
          activeDashboard?.background
        );
        addToast('App is now live for students!', 'success');
      }
    } catch (error) {
      console.error('Failed to toggle live session:', error);
      addToast('Failed to go live.', 'error');
    }
  };

  const handleRun = (app: MiniAppItem) => {
    updateWidget(widget.id, {
      config: { ...config, activeApp: app },
    });
  };

  const handleCloseActive = () => {
    updateWidget(widget.id, {
      config: { ...config, activeApp: null, activeAppUnsaved: false },
    });
  };

  const handleSavePasted = async () => {
    if (!user || !activeApp) return;
    const title =
      pendingSaveTitle.trim() || (activeApp.title ?? 'Untitled App');
    try {
      const id = activeApp.id;
      const appsRef = collection(db, 'users', user.uid, 'miniapps');
      const appData: MiniAppItem = {
        id,
        title,
        html: activeApp.html,
        createdAt: activeApp.createdAt,
        order:
          library.length > 0
            ? library.reduce((min, a) => Math.min(min, a.order ?? 0), 0) - 1
            : 0,
      };
      await setDoc(doc(appsRef, id), appData);
      // Clear unsaved flag and update title
      updateWidget(widget.id, {
        config: {
          ...config,
          activeApp: { ...activeApp, title },
          activeAppUnsaved: false,
        },
      });
      setShowSaveForm(false);
      setPendingSaveTitle('');
      addToast(`"${title}" saved to library!`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save app', 'error');
    }
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
    const confirmed = await showConfirm('Delete this app from your library?', {
      title: 'Delete App',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
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
            ? library.reduce((min, a) => Math.min(min, a.order ?? 0), 0) - 1
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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
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
    },
    [library, user, addToast]
  );

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
        content={
          <div className="w-full h-full flex flex-col relative overflow-hidden group/miniapp">
            {!isStudentView && (
              <>
                {/* Left Actions: Live Status */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-2 opacity-0 group-hover/miniapp:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={() => void handleToggleLive()}
                    className={`flex items-center gap-1.5 font-black uppercase tracking-widest transition-all rounded-lg ${
                      isLive
                        ? 'bg-red-500 text-white shadow-lg animate-pulse'
                        : 'bg-white/90 backdrop-blur-sm hover:bg-white text-slate-600 border border-slate-200/50 shadow-sm'
                    }`}
                    style={{
                      padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                      fontSize: 'min(10px, 2.5cqmin)',
                    }}
                    title={isLive ? 'End Live Session' : 'Go Live for Students'}
                  >
                    <Cast
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                    <span className="hidden sm:inline">
                      {isLive ? 'Live' : 'Go Live'}
                    </span>
                  </button>

                  {isLive && session?.code && (
                    <>
                      <div
                        className="flex items-center gap-1.5 bg-indigo-900/40 backdrop-blur-md text-white px-2 py-1 rounded-lg border border-white/20 font-mono tracking-wider font-black"
                        style={{ fontSize: 'min(12px, 3cqmin)' }}
                      >
                        <Radio
                          style={{
                            width: 'min(10px, 2.5cqmin)',
                            height: 'min(10px, 2.5cqmin)',
                          }}
                          className="animate-pulse"
                        />
                        {session.code}
                      </div>
                      <button
                        onClick={() => handleCopyLink(session.code)}
                        className="p-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg transition-all border border-white/10 shadow-sm"
                        title="Copy Student Link"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </>
                  )}
                </div>

                {/* Right Actions: App Controls */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover/miniapp:opacity-100 transition-opacity duration-200">
                  {config.activeAppUnsaved && (
                    <>
                      <div
                        className="bg-red-500 text-white font-black uppercase tracking-tighter rounded-lg shadow-sm animate-pulse flex items-center justify-center border border-red-400"
                        style={{
                          padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                          fontSize: 'min(8px, 2cqmin)',
                        }}
                      >
                        Unsaved
                      </div>
                      <button
                        onClick={() => {
                          setPendingSaveTitle(
                            activeApp.title !== 'Untitled App'
                              ? activeApp.title
                              : ''
                          );
                          setShowSaveForm(true);
                        }}
                        className="bg-indigo-600/90 backdrop-blur-sm hover:bg-indigo-700 text-white rounded-lg uppercase tracking-wider flex items-center shadow-lg border border-indigo-500 font-black transition-all"
                        title="Save to library"
                        style={{
                          padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                          fontSize: 'min(10px, 2.5cqmin)',
                          gap: 'min(6px, 1.5cqmin)',
                        }}
                      >
                        <Save
                          style={{
                            width: 'min(10px, 2.5cqmin)',
                            height: 'min(10px, 2.5cqmin)',
                          }}
                        />
                        <span className="hidden sm:inline">Save</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleCloseActive}
                    className={`${
                      isLive
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : 'bg-white/90 hover:bg-white text-slate-700'
                    } backdrop-blur-sm rounded-lg uppercase tracking-wider flex items-center shadow-sm border ${
                      isLive ? 'border-white/10' : 'border-slate-200/50'
                    } font-black transition-all`}
                    style={{
                      padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
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
                    <span className="hidden sm:inline">Library</span>
                  </button>
                </div>
              </>
            )}
            <iframe
              ref={iframeRef}
              srcDoc={activeApp.html}
              className="flex-1 w-full border-none bg-white" // Keep bg-white for iframe content visibility
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
              title={activeApp.title}
            />
            {/* Save-to-library overlay (shown when user pastes HTML and hasn't saved yet) */}
            {showSaveForm && (
              <div className="absolute inset-0 z-20 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-xs flex flex-col gap-3 animate-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-800 uppercase tracking-tight text-xs flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5 text-indigo-500" />
                      Save to Library
                    </h4>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                      aria-label="Cancel save"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pendingSaveTitle}
                    onChange={(e) => setPendingSaveTitle(e.target.value)}
                    placeholder="App title…"
                    autoFocus
                    className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSavePasted();
                      if (e.key === 'Escape') setShowSaveForm(false);
                    }}
                  />
                  <button
                    onClick={() => void handleSavePasted()}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Save className="w-3.5 h-3.5" /> Save App
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      />
    );
  }

  // --- RENDER: EDITOR MODE ---
  if (view === 'editor') {
    return (
      <MiniAppEditor
        widget={widget}
        editingId={editingId}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        editCode={editCode}
        setEditCode={setEditCode}
        prompt={prompt}
        setPrompt={setPrompt}
        showPromptInput={showPromptInput}
        setShowPromptInput={setShowPromptInput}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        onSave={handleSave}
        onCancel={() => setView('list')}
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
                        isLive={isLive && activeAppId === app.id}
                        onToggleLive={handleToggleLive}
                        onCopyLink={handleCopyLink}
                        sessionCode={session?.code}
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
                    isLive={isLive && activeAppId === app.id}
                    onToggleLive={handleToggleLive}
                    onCopyLink={handleCopyLink}
                    sessionCode={session?.code}
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
