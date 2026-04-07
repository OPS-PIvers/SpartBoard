import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Download, LayoutTemplate, Loader2 } from 'lucide-react';
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
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { Dashboard, DashboardTemplate } from '@/types';
import { SortableDashboardItem } from './SortableDashboardItem';
import { useDialog } from '@/context/useDialog';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import { db as firestoreDb, isAuthBypass } from '@/config/firebase';

const TEMPLATES_COLLECTION = 'dashboard_templates';

interface SidebarBoardsProps {
  isVisible: boolean;
}

interface DashboardData {
  name: string;
  [key: string]: unknown;
}

export const SidebarBoards: React.FC<SidebarBoardsProps> = ({ isVisible }) => {
  const { t } = useTranslation();
  const { showPrompt } = useDialog();
  const {
    dashboards,
    activeDashboard,
    createNewDashboard,
    loadDashboard,
    deleteDashboard,
    duplicateDashboard,
    renameDashboard,
    reorderDashboards,
    setDefaultDashboard,
    shareDashboard,
    addToast,
  } = useDashboard();

  const { canAccessFeature, isAdmin } = useAuth();

  const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [editingDashboard, setEditingDashboard] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Template state
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  // Skip loading state when auth is bypassed (no Firestore subscription needed)
  const [loadingTemplates, setLoadingTemplates] = useState(!isAuthBypass);
  const [saveAsTemplateDash, setSaveAsTemplateDash] =
    useState<Dashboard | null>(null);
  // When set, the "new board" modal creates from this template
  const [pendingTemplateSource, setPendingTemplateSource] =
    useState<DashboardTemplate | null>(null);

  // Subscribe to templates collection
  useEffect(() => {
    if (isAuthBypass) return;
    const q = query(
      collection(firestoreDb, TEMPLATES_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTemplates(
          snap.docs.map((d) => ({
            ...(d.data() as DashboardTemplate),
            id: d.id,
          }))
        );
        setLoadingTemplates(false);
      },
      (err) => {
        console.error('Failed to load templates:', err);
        setLoadingTemplates(false);
      }
    );
    return unsub;
  }, []);

  // Filter templates by access level
  const visibleTemplates = templates.filter((t) => {
    if (!t.enabled) return false;
    if (t.accessLevel === 'admin') return Boolean(isAdmin);
    // 'beta' shown to admins only for now (beta user email list is a future enhancement)
    if (t.accessLevel === 'beta') return Boolean(isAdmin);
    return true; // 'public'
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 15,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = dashboards.findIndex((d) => d.id === active.id);
        const newIndex = dashboards.findIndex((d) => d.id === over.id);

        const newOrder = arrayMove(dashboards, oldIndex, newIndex).map(
          (d) => d.id
        );
        void reorderDashboards(newOrder);
      }
    },
    [dashboards, reorderDashboards]
  );

  const handleShare = async (db?: Dashboard) => {
    if (!canAccessFeature('dashboard-sharing')) {
      addToast(t('toasts.boardSharingDisabled'), 'error');
      return;
    }
    const target = db ?? activeDashboard;
    if (!target) return;

    addToast(t('toasts.generatingShareLink'), 'info');

    try {
      const shareId = await shareDashboard(target);
      const url = `${window.location.origin}/share/${shareId}`;

      try {
        await navigator.clipboard.writeText(url);
        addToast(t('toasts.linkCopied'), 'success');
      } catch (clipErr) {
        console.warn(
          'Initial clipboard write failed, likely focus issue:',
          clipErr
        );
        addToast(t('toasts.boardShared'), 'success');
      }
    } catch (err) {
      console.error('Share failed:', err);
      addToast(t('toasts.shareFailed'), 'error');
    }
  };

  const handleImport = async () => {
    const data = await showPrompt(t('sidebar.boards.enterBoardData'), {
      title: 'Import Board',
      placeholder: '{"name":"...","widgets":[...]}',
      multiline: true,
      confirmLabel: 'Import',
    });
    if (data) {
      try {
        const parsed = JSON.parse(data) as DashboardData;
        void createNewDashboard(
          `${t('sidebar.boards.imported')}: ${parsed.name}`,
          parsed as unknown as Dashboard
        );
        addToast(t('toasts.boardImported'), 'success');
      } catch {
        addToast(t('toasts.invalidBoardData'), 'error');
      }
    }
  };

  const handleUseTemplate = (template: DashboardTemplate) => {
    setPendingTemplateSource(template);
    setNewDashboardName(template.name);
    setShowNewDashboardModal(true);
  };

  const handleCreateBoard = () => {
    if (!newDashboardName.trim()) return;
    if (pendingTemplateSource) {
      // Create from template: deep-clone widgets to avoid shared refs
      const templateData: Dashboard = {
        id: crypto.randomUUID(),
        name: newDashboardName.trim(),
        background: pendingTemplateSource.background ?? 'bg-slate-800',
        widgets: pendingTemplateSource.widgets.map((w) => ({
          ...w,
          id: crypto.randomUUID(),
          config: structuredClone(w.config),
        })),
        globalStyle: pendingTemplateSource.globalStyle as
          | import('@/types').GlobalStyle
          | undefined,
        createdAt: Date.now(),
      };
      void createNewDashboard(newDashboardName.trim(), templateData);
    } else {
      void createNewDashboard(newDashboardName.trim());
    }
    setShowNewDashboardModal(false);
    setPendingTemplateSource(null);
    setNewDashboardName('');
  };

  const handleCloseNewModal = () => {
    setShowNewDashboardModal(false);
    setPendingTemplateSource(null);
    setNewDashboardName('');
  };

  return (
    <>
      <div
        className={`absolute inset-0 p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
          isVisible
            ? 'translate-x-0 opacity-100 visible'
            : 'translate-x-full opacity-0 invisible'
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setNewDashboardName('');
              setPendingTemplateSource(null);
              setShowNewDashboardModal(true);
            }}
            className="flex flex-col items-center justify-center gap-1.5 p-3 bg-brand-blue-primary text-white rounded-xl shadow-sm hover:bg-brand-blue-dark transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="text-xxs font-bold uppercase tracking-wider">
              {t('sidebar.boards.newBoard')}
            </span>
          </button>
          {canAccessFeature('dashboard-import') && (
            <button
              onClick={handleImport}
              className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="text-xxs font-bold uppercase tracking-wider">
                {t('sidebar.boards.import')}
              </span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
            {t('sidebar.boards.myBoards')}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={dashboards.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {dashboards.map((db) => (
                  <SortableDashboardItem
                    key={db.id}
                    db={db}
                    isActive={activeDashboard?.id === db.id}
                    onLoad={loadDashboard}
                    onRename={(id, name) => setEditingDashboard({ id, name })}
                    onDelete={deleteDashboard}
                    onSetDefault={setDefaultDashboard}
                    onDuplicate={duplicateDashboard}
                    onShare={handleShare}
                    onSaveAsTemplate={() => setSaveAsTemplateDash(db)}
                    canShare={canAccessFeature('dashboard-sharing')}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Templates section */}
        {!loadingTemplates && visibleTemplates.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
              Templates
            </h3>
            <div className="flex flex-col gap-2">
              {visibleTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template)}
                  className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-brand-blue-primary hover:shadow-sm transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-blue-primary/10 flex items-center justify-center shrink-0">
                    <LayoutTemplate className="w-4 h-4 text-brand-blue-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-700 truncate group-hover:text-brand-blue-dark">
                      {template.name}
                    </div>
                    {template.description && (
                      <div className="text-xxs text-slate-400 truncate">
                        {template.description}
                      </div>
                    )}
                  </div>
                  <span className="text-xxs font-bold text-brand-blue-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Use →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {loadingTemplates && (
          <div className="flex items-center gap-2 text-slate-400 text-xs px-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading templates…
          </div>
        )}
      </div>

      {editingDashboard &&
        createPortal(
          <div className="fixed inset-0 z-popover flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
              <h2 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider">
                {t('sidebar.boards.renameDashboard')}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                {t('sidebar.boards.enterNewName')}
              </p>
              <input
                type="text"
                value={editingDashboard.name}
                onChange={(e) =>
                  setEditingDashboard({
                    ...editingDashboard,
                    name: e.target.value,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editingDashboard.name.trim()) {
                      void renameDashboard(
                        editingDashboard.id,
                        editingDashboard.name.trim()
                      );
                      setEditingDashboard(null);
                    }
                  } else if (e.key === 'Escape') {
                    setEditingDashboard(null);
                  }
                }}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingDashboard(null)}
                  className="px-3 py-2 text-xxs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (editingDashboard.name.trim()) {
                      void renameDashboard(
                        editingDashboard.id,
                        editingDashboard.name.trim()
                      );
                      setEditingDashboard(null);
                    }
                  }}
                  className="px-3 py-2 text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-sm transition"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showNewDashboardModal &&
        createPortal(
          <div className="fixed inset-0 z-popover flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
              <h2 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider">
                {pendingTemplateSource
                  ? 'Create Board from Template'
                  : t('sidebar.boards.newBoardTitle')}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                {pendingTemplateSource
                  ? `Give your new board a name. It will start with all the widgets from "${pendingTemplateSource.name}".`
                  : t('sidebar.boards.enterName')}
              </p>
              <input
                type="text"
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBoard();
                  } else if (e.key === 'Escape') {
                    handleCloseNewModal();
                  }
                }}
                autoFocus
                placeholder={t('sidebar.boards.boardName')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCloseNewModal}
                  className="px-3 py-2 text-xxs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateBoard}
                  disabled={!newDashboardName.trim()}
                  className="px-3 py-2 text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-sm transition disabled:opacity-50"
                >
                  {pendingTemplateSource
                    ? 'Create from Template'
                    : t('sidebar.boards.create')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <SaveAsTemplateModal
        isOpen={!!saveAsTemplateDash}
        currentDashboard={saveAsTemplateDash}
        onClose={() => setSaveAsTemplateDash(null)}
      />
    </>
  );
};
