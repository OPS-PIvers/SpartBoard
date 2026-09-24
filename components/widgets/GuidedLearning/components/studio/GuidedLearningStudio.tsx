import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Folder as FolderIcon,
  Footprints,
  Inbox,
  PanelRight,
  Play,
} from 'lucide-react';
import type {
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  LibraryFolder,
} from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useAutosave } from '@/hooks/useAutosave';
import { requestStartTour } from '@/components/tours/tourState';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { EditorHeader } from '../EditorHeader';
import { GuidedLearningAIGenerator } from '../GuidedLearningAIGenerator';
import { useGuidedLearningEditorState } from '../useGuidedLearningEditorState';
import { useSetDraftPersistence } from '../useSetDraftPersistence';
import type { DevicePreset } from '../../types/stage';
import { StudioCanvas } from './StudioCanvas';
import { useCanvasTools } from './useCanvasTools';
import { StudioPlayMode } from './StudioPlayMode';
import { StudioFilmstrip } from './StudioFilmstrip';
import { StudioTimeline } from './StudioTimeline';
import { StudioPropertiesPanel } from './StudioPropertiesPanel';
import { DevicePresetPicker } from './DevicePresetPicker';
import { loadDevicePreset, saveDevicePreset } from './devicePresets';
import { useStudioShortcuts, type StudioShortcut } from './useStudioShortcuts';

export interface GuidedLearningStudioProps {
  set: GuidedLearningSet;
  meta: GuidedLearningSetMetadata | null;
  onClose: () => void;
  onSave: (set: GuidedLearningSet, driveFileId?: string) => Promise<void>;
  onAiGenerated?: (set: GuidedLearningSet) => void;
  /** Close the Studio and open the classic editor on this (latest) draft. */
  onOpenClassic?: (latest: GuidedLearningSet) => void;
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  /** Opens with this step selected. */
  initialStepId?: string;
  /** Recorder-drafted step text, flagged in the properties panel until edited. */
  aiDrafts?: ReadonlyMap<string, { label: string; text: string }>;
}

/** Full-screen Guided Learning editor whose canvas is the real player stage. */
export const GuidedLearningStudio: React.FC<GuidedLearningStudioProps> = ({
  set,
  meta,
  onClose,
  onSave,
  onAiGenerated,
  onOpenClassic,
  folders,
  folderId,
  onFolderChange,
  initialStepId,
  aiDrafts,
}) => {
  const { t } = useTranslation();
  const { isAdmin, canAccessFeature } = useAuth();
  const { showConfirm, currentDialog } = useDialog();
  const addToast = useContext(DashboardContext)?.addToast;
  const [showAiGen, setShowAiGen] = useState(false);
  const [preset, setPreset] = useState<DevicePreset>(loadDevicePreset);
  // Below 1024px the properties column is a drawer.
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);

  const editorState = useGuidedLearningEditorState({
    existingSet: set,
    existingMeta: meta,
    folders,
    folderId,
    onFolderChange,
  });
  const { draftToken, persistDraft, buildSavedSet, closeEditor } =
    useSetDraftPersistence({
      isOpen: true,
      set,
      editorState,
      onSave,
      driveFileId: meta?.driveFileId,
      onClose,
    });

  const autosave = useAutosave({
    draftToken,
    resetKey: set.id,
    // A set with no slide has nothing to persist, and an in-flight upload would be written as a half-set.
    enabled: editorState.imageUrls.length > 0 && !editorState.uploading,
    onSave: persistDraft,
  });

  const flushOrConfirm = useCallback(
    async (force = false): Promise<boolean> => {
      if (await autosave.flush({ force })) return true;
      return showConfirm(t('glStudio.unsavedBody'), {
        title: t('glStudio.unsavedTitle'),
        variant: 'warning',
        confirmLabel: t('glStudio.closeAnyway'),
        cancelLabel: t('glStudio.keepEditing'),
      });
    },
    [autosave, showConfirm, t]
  );

  const requestClose = useCallback(async () => {
    const { uploading, imageUrls, title, description, abandonUploads } =
      editorState;
    if (uploading) {
      const closeAnyway = await showConfirm(t('glStudio.uploadingBody'), {
        title: t('glStudio.uploadingTitle'),
        variant: 'warning',
        confirmLabel: t('glStudio.closeAnyway'),
        cancelLabel: t('glStudio.keepEditing'),
      });
      if (!closeAnyway) return;
      abandonUploads();
      if (imageUrls.length > 0 && !(await flushOrConfirm(true))) return;
      closeEditor();
      return;
    }
    if (imageUrls.length === 0 && (title.trim() || description.trim())) {
      const discard = await showConfirm(t('glStudio.emptySetBody'), {
        title: t('glStudio.emptySetTitle'),
        variant: 'warning',
        confirmLabel: t('glStudio.discard'),
        cancelLabel: t('glStudio.keepEditing'),
      });
      if (discard) closeEditor();
      return;
    }
    if (await flushOrConfirm()) closeEditor();
  }, [editorState, showConfirm, t, flushOrConfirm, closeEditor]);

  // The runner loads the saved set, so an unsaved draft never starts.
  const runLive = useCallback(async () => {
    if (!(await autosave.flush())) {
      addToast?.(t('glStudio.runLiveFailed'), 'error');
      return;
    }
    closeEditor();
    requestStartTour({ setId: set.id });
  }, [autosave, addToast, t, closeEditor, set.id]);

  // The draft travels to the classic editor, which keeps saving it, so nothing to confirm.
  const openClassic = useCallback(async () => {
    if (!onOpenClassic) return;
    await autosave.flush();
    onOpenClassic(buildSavedSet() ?? set);
  }, [onOpenClassic, autosave, buildSavedSet, set]);

  const choosePreset = useCallback((next: DevicePreset) => {
    setPreset(next);
    saveDevicePreset(next);
  }, []);

  const {
    steps,
    selectedStepId,
    setSelectedStepId,
    setCurrentImageIndex,
    deleteStep,
    undo,
    redo,
  } = editorState;
  const canRunLive =
    !!set.isBuilding &&
    canAccessFeature('gl-live-tours') &&
    steps.some((step) => step.tour);

  const selectStepAt = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;
      setSelectedStepId(step.id);
      setCurrentImageIndex(step.imageIndex);
    },
    [steps, setSelectedStepId, setCurrentImageIndex]
  );

  const [pendingStepId, setPendingStepId] = useState(initialStepId);
  if (pendingStepId) {
    const opening = steps.find((s) => s.id === pendingStepId);
    setPendingStepId(undefined);
    if (opening) {
      setSelectedStepId(opening.id);
      setCurrentImageIndex(opening.imageIndex);
    }
  }

  const deleteSelected = useCallback(() => {
    if (!selectedStepId) return;
    deleteStep(selectedStepId);
    addToast?.(t('glStudio.stepDeleted'), 'info', {
      label: t('glStudio.undo'),
      onClick: undo,
    });
  }, [selectedStepId, deleteStep, addToast, t, undo]);

  const [playing, setPlaying] = useState<{
    set: GuidedLearningSet;
    startStepId: string | null;
  } | null>(null);
  // The step the player last showed, so leaving play mode selects it.
  const lastPlayedRef = useRef<string | null>(null);
  const startPlay = useCallback(() => {
    if (steps.length === 0) return;
    lastPlayedRef.current = null;
    setPlaying({
      set: buildSavedSet() ?? set,
      startStepId: selectedStepId ?? steps[0].id,
    });
  }, [steps, buildSavedSet, set, selectedStepId]);
  const exitPlay = useCallback(() => {
    setPlaying(null);
    const lastId = lastPlayedRef.current;
    const shown = lastId ? steps.find((s) => s.id === lastId) : undefined;
    if (!shown) return;
    setSelectedStepId(shown.id);
    setCurrentImageIndex(shown.imageIndex);
  }, [steps, setSelectedStepId, setCurrentImageIndex]);

  const tools = useCanvasTools(editorState, preset);
  const { rows: canvasRows, deleteFocusedVertex } = tools;

  const selectedIndex = steps.findIndex((s) => s.id === selectedStepId);
  const editKeymap = useMemo<StudioShortcut[]>(
    () => [
      { id: 'play', key: ' ', shift: true, run: startPlay },
      { id: 'undo', key: 'z', mod: true, run: undo },
      { id: 'redo', key: 'z', mod: true, shift: true, run: redo },
      { id: 'redo-y', key: 'y', mod: true, run: redo },
      {
        id: 'delete',
        key: 'Delete',
        run: (e) => {
          if (!deleteFocusedVertex(e)) deleteSelected();
        },
      },
      {
        id: 'prev-step',
        key: '[',
        run: () => selectStepAt(Math.max(0, selectedIndex - 1)),
      },
      {
        id: 'next-step',
        key: ']',
        run: () =>
          selectStepAt(
            selectedIndex < 0
              ? 0
              : Math.min(steps.length - 1, selectedIndex + 1)
          ),
      },
      ...canvasRows,
    ],
    [
      undo,
      redo,
      deleteSelected,
      deleteFocusedVertex,
      canvasRows,
      selectStepAt,
      selectedIndex,
      steps.length,
      startPlay,
    ]
  );
  const playKeymap = useMemo<StudioShortcut[]>(
    () => [
      {
        id: 'exit-play',
        key: 'Escape',
        run: exitPlay,
      },
      {
        id: 'exit-play-toggle',
        key: ' ',
        shift: true,
        run: exitPlay,
      },
    ],
    [exitPlay]
  );
  useStudioShortcuts(playing ? playKeymap : editKeymap, {
    // An open dialog owns the keyboard, Escape included.
    enabled: !showAiGen && !currentDialog,
    editing: !playing && tools.editingStepId !== null,
  });

  const canUseAi =
    !!onAiGenerated && isAdmin === true && canAccessFeature('gemini-functions');

  const folderButtonRef = useRef<HTMLButtonElement>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const folderPickerEnabled = Boolean(folders && onFolderChange);
  const currentFolder =
    folderId != null ? (folders?.find((f) => f.id === folderId) ?? null) : null;
  const folderLabel =
    folderId == null
      ? t('glStudio.noFolder')
      : currentFolder
        ? t('glStudio.inFolder', { name: currentFolder.name })
        : t('glStudio.folderMissing');

  const stepCount = steps.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('glStudio.dialogLabel')}
      data-testid="gl-studio"
      className="fixed inset-0 flex flex-col bg-slate-100"
      style={{ zIndex: Z_INDEX.modalContent }}
    >
      <EditorHeader
        title={editorState.title}
        onTitleChange={editorState.setTitle}
        titlePlaceholder={t('glStudio.titlePlaceholder')}
        subtitle={t('glStudio.stepCount', { count: stepCount })}
        notice={
          editorState.imageUrls.length === 0
            ? t('glStudio.needSlide')
            : !editorState.title.trim()
              ? t('glStudio.needTitle')
              : null
        }
        autosaveStatus={autosave.status}
        onRetrySave={() => void autosave.flush()}
        onDraftWithAi={canUseAi ? () => setShowAiGen(true) : undefined}
        onOpenClassic={onOpenClassic ? () => void openClassic() : undefined}
        onClose={() => void requestClose()}
        extras={
          <>
            {!playing && (
              <button
                type="button"
                onClick={startPlay}
                disabled={stepCount === 0}
                title={t('glStudio.playShortcut')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-slate-400 disabled:opacity-40"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t('glStudio.playFromHere')}
              </button>
            )}
            {canRunLive && !playing && (
              <button
                type="button"
                onClick={() => void runLive()}
                title={t('glStudio.runLiveHint')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-slate-400"
              >
                <Footprints className="h-4 w-4" aria-hidden="true" />
                {t('glStudio.runLive')}
              </button>
            )}
            <DevicePresetPicker preset={preset} onChange={choosePreset} />
            <button
              type="button"
              onClick={() => setPropertiesOpen((v) => !v)}
              aria-expanded={propertiesOpen}
              aria-controls="gl-studio-properties"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-slate-400 lg:hidden"
            >
              <PanelRight className="h-4 w-4" aria-hidden="true" />
              {t('glStudio.properties')}
            </button>
            {folderPickerEnabled && (
              <button
                ref={folderButtonRef}
                type="button"
                onClick={() => setFolderPickerOpen((v) => !v)}
                title={folderLabel}
                aria-label={folderLabel}
                aria-expanded={folderPickerOpen}
                aria-haspopup="dialog"
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                {folderId == null ? (
                  <Inbox className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <FolderIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            )}
          </>
        }
      />
      <div className="relative grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_360px]">
        <StudioFilmstrip state={editorState} />
        <div className="flex min-h-0 min-w-0 flex-col">
          <main ref={canvasRef} className="min-h-0 flex-1 p-6">
            {playing ? (
              <StudioPlayMode
                set={playing.set}
                preset={preset}
                startStepId={playing.startStepId}
                playerV2={canAccessFeature('gl-player-v2')}
                onStepShown={(id) => {
                  lastPlayedRef.current = id;
                }}
                onExit={exitPlay}
              />
            ) : (
              <StudioCanvas
                state={editorState}
                tools={tools}
                setId={set.id}
                preset={preset}
              />
            )}
          </main>
          <StudioTimeline state={editorState} />
        </div>
        {propertiesOpen && (
          <button
            type="button"
            aria-label={t('glStudio.closeProperties')}
            onClick={() => setPropertiesOpen(false)}
            className="absolute inset-0 z-10 bg-slate-900/30 lg:hidden"
          />
        )}
        <aside
          id="gl-studio-properties"
          aria-label={t('glStudio.properties')}
          data-open={propertiesOpen}
          className={`absolute inset-y-0 right-0 z-20 w-[360px] max-w-full overflow-y-auto border-l border-slate-200 bg-white shadow-xl transition-transform custom-scrollbar lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:shadow-none ${
            propertiesOpen
              ? 'translate-x-0'
              : 'invisible translate-x-full lg:visible'
          }`}
        >
          <StudioPropertiesPanel
            state={editorState}
            canvasRef={canvasRef}
            aiDrafts={aiDrafts}
            liveTours={!!set.isBuilding && canAccessFeature('gl-live-tours')}
          />
        </aside>
      </div>
      {showAiGen && canUseAi && (
        <GuidedLearningAIGenerator
          onClose={() => setShowAiGen(false)}
          onGenerated={(generated) => {
            setShowAiGen(false);
            onAiGenerated?.(generated);
          }}
        />
      )}
      {folderPickerEnabled && folderPickerOpen && (
        <FolderPickerPopover
          variant="popover"
          anchorRef={folderButtonRef}
          folders={folders ?? []}
          selectedFolderId={folderId ?? null}
          onSelect={(next) => onFolderChange?.(next)}
          onClose={() => setFolderPickerOpen(false)}
          title={t('glStudio.selectFolder')}
        />
      )}
    </div>,
    document.body
  );
};
