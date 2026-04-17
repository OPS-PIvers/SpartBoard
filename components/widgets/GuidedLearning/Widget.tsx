import React, { useState, useCallback, useMemo } from 'react';
import {
  WidgetData,
  GuidedLearningConfig,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { useGuidedLearningSessionTeacher } from '@/hooks/useGuidedLearningSession';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { GuidedLearningLibrary } from './components/GuidedLearningLibrary';
import { GuidedLearningEditorModal } from './components/GuidedLearningEditorModal';
import { GuidedLearningPlayer } from './components/GuidedLearningPlayer';
import { GuidedLearningResults } from './components/GuidedLearningResults';
import { Loader2 } from 'lucide-react';

// ─── AI generation modal (admin only) ────────────────────────────────────────
import { GuidedLearningAIGenerator } from './components/GuidedLearningAIGenerator';
import { normalizeGuidedLearningSet } from './utils/setMigration';

export const GuidedLearningWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const rawConfig = widget.config as GuidedLearningConfig;
  // Normalize legacy 'editor' view — the inline editor is removed; use the modal instead
  const config = useMemo<GuidedLearningConfig>(
    () =>
      rawConfig.view === 'editor'
        ? { ...rawConfig, view: 'library' }
        : rawConfig,
    [rawConfig]
  );

  const {
    sets,
    buildingSets,
    loading,
    buildingLoading,
    isDriveConnected,
    saveSet,
    loadSetData,
    deleteSet,
    saveBuildingSet,
    deleteBuildingSet,
  } = useGuidedLearning(user?.uid);

  const { createSession } = useGuidedLearningSessionTeacher(user?.uid);

  // Local component state
  const [loadingSet, setLoadingSet] = useState(false);
  const [activeSet, setActiveSet] = useState<GuidedLearningSet | null>(null);
  const [editingSet, setEditingSet] = useState<GuidedLearningSet | null>(null);
  const [editingMeta, setEditingMeta] =
    useState<GuidedLearningSetMetadata | null>(null);
  const [showAIGen, setShowAIGen] = useState(false);
  const [recentSessionIds, setRecentSessionIds] = useState<
    Record<string, string>
  >({});

  const setView = useCallback(
    (view: GuidedLearningConfig['view']) => {
      updateWidget(widget.id, {
        config: { ...config, view } as GuidedLearningConfig,
      });
    },
    [updateWidget, widget.id, config]
  );

  // Load set data from Drive or use building set directly
  const loadSet = useCallback(
    async (
      setId: string,
      driveFileId?: string,
      buildingSet?: GuidedLearningSet
    ): Promise<GuidedLearningSet | null> => {
      if (buildingSet) return normalizeGuidedLearningSet(buildingSet);
      if (!driveFileId) return null;
      setLoadingSet(true);
      try {
        const data = await loadSetData(driveFileId);
        return normalizeGuidedLearningSet(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load set';
        addToast(msg, 'error');
        return null;
      } finally {
        setLoadingSet(false);
      }
    },
    [loadSetData, addToast]
  );

  const handlePlay = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    const data = await loadSet(setId, driveFileId, buildingSet);
    if (!data) return;
    setActiveSet(data);
    setView('player');
  };

  const handleEdit = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    if (buildingSet) {
      setEditingSet(buildingSet);
      setEditingMeta(null);
    } else {
      const meta = sets.find((s) => s.id === setId) ?? null;
      const data = await loadSet(setId, driveFileId);
      if (!data) return;
      setEditingSet(data);
      setEditingMeta(meta);
    }
  };

  const handleSave = async (set: GuidedLearningSet, driveFileId?: string) => {
    if (set.isBuilding) {
      await saveBuildingSet(set);
      addToast('Building set saved.', 'success');
    } else {
      await saveSet(set, driveFileId);
      addToast('Set saved to Drive.', 'success');
    }
  };

  const handleDelete = async (setId: string, driveFileId: string) => {
    try {
      await deleteSet(setId, driveFileId);
      addToast('Set deleted.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      addToast(msg, 'error');
    }
  };

  const handleDeleteBuilding = async (setId: string) => {
    try {
      await deleteBuildingSet(setId);
      addToast('Building set deleted.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      addToast(msg, 'error');
    }
  };

  const handleAssign = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    const data = await loadSet(setId, driveFileId, buildingSet);
    if (!data) return;
    try {
      const url = await createSession(data);
      setRecentSessionIds((prev) => ({
        ...prev,
        [setId]: url.split('/').pop() ?? '',
      }));
      await navigator.clipboard.writeText(url);
      addToast('Assignment link copied to clipboard!', 'success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to create session';
      addToast(msg, 'error');
    }
  };

  const handleViewResults = async (sessionId: string) => {
    // Ensure the corresponding set is loaded so the results view has an activeSet
    const matchingEntry = Object.entries(recentSessionIds).find(
      ([, storedSessionId]) => storedSessionId === sessionId
    );
    if (matchingEntry) {
      const [setId] = matchingEntry;
      const meta = sets.find((s) => s.id === setId);
      const buildingSet = buildingSets.find((s) => s.id === setId);
      const loaded = await loadSet(setId, meta?.driveFileId, buildingSet);
      if (loaded) setActiveSet(loaded);
    }
    updateWidget(widget.id, {
      config: {
        ...config,
        view: 'results',
        resultsSessionId: sessionId,
      } as GuidedLearningConfig,
    });
  };

  const emptySet = (): GuidedLearningSet => ({
    id: crypto.randomUUID(),
    title: '',
    imageUrls: [],
    steps: [],
    mode: 'structured',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    authorUid: user?.uid,
  });

  const handleCreateNew = () => {
    setEditingSet(emptySet());
    setEditingMeta(null);
  };

  const handleCreateNewBuilding = () => {
    setEditingSet({ ...emptySet(), isBuilding: true });
    setEditingMeta(null);
  };

  if (loadingSet) {
    return (
      <WidgetLayout
        content={
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        }
      />
    );
  }

  return (
    <>
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        content={
          <div className="h-full w-full">
            {config.view === 'library' && (
              <GuidedLearningLibrary
                widget={widget}
                sets={sets}
                buildingSets={buildingSets}
                loading={loading}
                buildingLoading={buildingLoading}
                isDriveConnected={isDriveConnected}
                onPlay={handlePlay}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDeleteBuilding={handleDeleteBuilding}
                onAssign={handleAssign}
                onCreateNew={handleCreateNew}
                onCreateNewBuilding={handleCreateNewBuilding}
                onViewResults={handleViewResults}
                onGenerateWithAI={() => setShowAIGen(true)}
                recentSessionIds={recentSessionIds}
              />
            )}

            {config.view === 'player' && activeSet && (
              <GuidedLearningPlayer
                set={activeSet}
                onClose={() => setView('library')}
                teacherMode
              />
            )}

            {config.view === 'results' &&
              config.resultsSessionId &&
              activeSet && (
                <GuidedLearningResults
                  set={activeSet}
                  sessionId={config.resultsSessionId}
                  onClose={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        view: 'library',
                        resultsSessionId: null,
                      } as GuidedLearningConfig,
                    })
                  }
                />
              )}

            {showAIGen && (
              <GuidedLearningAIGenerator
                onClose={() => setShowAIGen(false)}
                onGenerated={(set) => {
                  setEditingSet({ ...set, isBuilding: true });
                  setEditingMeta(null);
                  setShowAIGen(false);
                }}
              />
            )}
          </div>
        }
      />
      <GuidedLearningEditorModal
        isOpen={!!editingSet}
        set={editingSet}
        meta={editingMeta}
        onClose={() => {
          setEditingSet(null);
          setEditingMeta(null);
        }}
        onSave={handleSave}
        onAiGenerated={(generated) => {
          setEditingSet({ ...generated, isBuilding: true });
          setEditingMeta(null);
        }}
      />
    </>
  );
};
