import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Download } from 'lucide-react';
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

import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { Dashboard } from '@/types';
import { SortableDashboardItem } from './SortableDashboardItem';

interface SidebarBoardsProps {
  isVisible: boolean;
}

interface DashboardData {
  name: string;
  [key: string]: unknown;
}

export const SidebarBoards: React.FC<SidebarBoardsProps> = ({ isVisible }) => {
  const { t } = useTranslation();
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

  const { canAccessFeature } = useAuth();

  const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [editingDashboard, setEditingDashboard] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = dashboards.findIndex((d) => d.id === active.id);
      const newIndex = dashboards.findIndex((d) => d.id === over.id);

      const newOrder = arrayMove(dashboards, oldIndex, newIndex).map(
        (d) => d.id
      );
      reorderDashboards(newOrder);
    }
  };

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

  const handleImport = () => {
    const data = prompt(t('sidebar.boards.enterBoardData'));
    if (data) {
      try {
        const parsed = JSON.parse(data) as DashboardData;
        createNewDashboard(
          `${t('sidebar.boards.imported')}: ${parsed.name}`,
          parsed as unknown as Dashboard
        );
        addToast(t('toasts.boardImported'), 'success');
      } catch {
        addToast(t('toasts.invalidBoardData'), 'error');
      }
    }
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
                    canShare={canAccessFeature('dashboard-sharing')}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
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
                      renameDashboard(
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
                      renameDashboard(
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
                {t('sidebar.boards.newBoardTitle')}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                {t('sidebar.boards.enterName')}
              </p>
              <input
                type="text"
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (newDashboardName.trim()) {
                      createNewDashboard(newDashboardName.trim());
                      setShowNewDashboardModal(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowNewDashboardModal(false);
                  }
                }}
                autoFocus
                placeholder={t('sidebar.boards.boardName')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNewDashboardModal(false)}
                  className="px-3 py-2 text-xxs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (newDashboardName.trim()) {
                      createNewDashboard(newDashboardName.trim());
                      setShowNewDashboardModal(false);
                    }
                  }}
                  className="px-3 py-2 text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-sm transition"
                >
                  {t('sidebar.boards.create')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
