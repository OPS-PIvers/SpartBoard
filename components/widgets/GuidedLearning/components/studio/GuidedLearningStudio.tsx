import React, {
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Folder as FolderIcon,
  Footprints,
  Inbox,
  Lock,
  PanelRight,
  Play,
  Redo2,
  Undo2,
  Upload,
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
import {
  requestRecordTour,
  requestStartTour,
} from '@/components/tours/tourState';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { EditorHeader } from '../EditorHeader';
import { GuidedLearningAIGenerator } from '../GuidedLearningAIGenerator';
import {
  useGuidedLearningEditorState,
  type SlideUploadIssue,
} from '../useGuidedLearningEditorState';
import { ScreenCaptureModal } from '../ScreenCaptureModal';
import { useSetDraftPersistence } from '../useSetDraftPersistence';
import type {
  GuidedLearningLatestSet,
  GuidedLearningSaveGuard,
} from '../../utils/saveConflict';
import type { DevicePreset } from '../../types/stage';
import { StudioCanvas } from './StudioCanvas';
import { StudioStartHub } from './StudioStartHub';
import { useFileDrop } from './useFileDrop';
import { uploadIssueMessage } from './uploadIssueMessage';
import { useCanvasTools } from './useCanvasTools';
import { StudioPlayMode } from './StudioPlayMode';
import { StudioFilmstrip } from './StudioFilmstrip';
import { StudioTimeline } from './StudioTimeline';
import { StudioPropertiesPanel } from './StudioPropertiesPanel';
import { DevicePresetPicker } from './DevicePresetPicker';
import { loadDevicePreset, saveDevicePreset } from './devicePresets';
import {
  hasTextSelection,
  isTypingTarget,
  useStudioShortcuts,
  type StudioShortcut,
} from './useStudioShortcuts';
import { stepClipboardIsLatest } from './stepClipboard';
import { SetTooLargeError } from '@/utils/firestoreDocSize';

const MAX_ISSUE_TOASTS = 3;

export interface GuidedLearningStudioProps {
  set: GuidedLearningSet;
  meta: GuidedLearningSetMetadata | null;
  onClose: () => void;
  onSave: (
    set: GuidedLearningSet,
    driveFileId?: string,
    guard?: GuidedLearningSaveGuard
  ) => Promise<void>;
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
  /** Closes the Studio and opens the .gl.json import; offered on an empty set. */
  onImport?: () => void;
}

/** Full-screen Guided Learning editor whose canvas is the real player stage. */
export const GuidedLearningStudio: React.FC<GuidedLearningStudioProps> = (
  props
) => {
  const [reloaded, setReloaded] = useState<{
    from: GuidedLearningSet;
    latest: GuidedLearningLatestSet;
    count: number;
  } | null>(null);
  // A different set from the parent drops a reloaded copy.
  const current = reloaded?.from === props.set ? reloaded : null;
  return (
    <StudioSession
      key={current?.count ?? 0}
      {...props}
      set={current?.latest.set ?? props.set}
      loadedUpdatedAt={
        current ? current.latest.updatedAt : props.meta?.updatedAt
      }
      onReloaded={(latest) =>
        setReloaded((prev) => ({
          from: props.set,
          latest,
          count: (prev?.count ?? 0) + 1,
        }))
      }
    />
  );
};

const StudioSession: React.FC<
  GuidedLearningStudioProps & {
    loadedUpdatedAt?: number;
    onReloaded: (latest: GuidedLearningLatestSet) => void;
  }
> = ({
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
  onImport,
  loadedUpdatedAt,
  onReloaded,
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
  const [capturing, setCapturing] = useState(false);

  const toastUploadIssues = useCallback(
    (issues: SlideUploadIssue[]) => {
      const shown = issues.slice(0, MAX_ISSUE_TOASTS);
      for (const issue of shown)
        addToast?.(uploadIssueMessage(t, issue), 'error');
      const rest = issues.length - shown.length;
      if (rest > 0)
        addToast?.(t('glStudio.uploadMoreIssues', { count: rest }), 'error');
    },
    [addToast, t]
  );

  const editorState = useGuidedLearningEditorState({
    existingSet: set,
    existingMeta: meta,
    folders,
    folderId,
    onFolderChange,
    setWideTimeline: true,
    onUploadIssues: toastUploadIssues,
  });
  const {
    draftToken,
    persistDraft,
    buildSavedSet,
    closeEditor,
    conflict,
    armOverwrite,
    readOnly,
  } = useSetDraftPersistence({
    isOpen: true,
    set,
    editorState,
    onSave,
    driveFileId: meta?.driveFileId,
    loadedUpdatedAt,
    onClose,
  });

  const autosave = useAutosave({
    draftToken,
    resetKey: set.id,
    // No slide, an in-flight upload, an unresolved conflict or a newer schema: nothing safe to write.
    enabled:
      editorState.imageUrls.length > 0 &&
      !editorState.uploading &&
      !conflict &&
      !readOnly,
    onSave: persistDraft,
  });

  const flushOrConfirm = useCallback(
    async (force = false): Promise<boolean> => {
      // Paused autosave reports nothing owed, but a conflicted draft is unsaved.
      if (!conflict && (await autosave.flush({ force }))) return true;
      return showConfirm(t('glStudio.unsavedBody'), {
        title: t('glStudio.unsavedTitle'),
        variant: 'warning',
        confirmLabel: t('glStudio.closeAnyway'),
        cancelLabel: t('glStudio.keepEditing'),
      });
    },
    [conflict, autosave, showConfirm, t]
  );

  const [resolving, setResolving] = useState(false);
  const reloadLatest = useCallback(async () => {
    if (!conflict) return;
    setResolving(true);
    try {
      onReloaded(await conflict.loadLatest());
    } catch {
      addToast?.(t('glStudio.reloadFailed'), 'error');
      setResolving(false);
    }
  }, [conflict, onReloaded, addToast, t]);
  const overwrite = useCallback(async () => {
    armOverwrite();
    setResolving(true);
    await autosave.flush({ force: true });
    setResolving(false);
  }, [armOverwrite, autosave]);

  // Resolves true once the Studio has closed.
  const requestClose = useCallback(async (): Promise<boolean> => {
    const { uploading, imageUrls, title, description, abandonUploads } =
      editorState;
    if (uploading) {
      const closeAnyway = await showConfirm(t('glStudio.uploadingBody'), {
        title: t('glStudio.uploadingTitle'),
        variant: 'warning',
        confirmLabel: t('glStudio.closeAnyway'),
        cancelLabel: t('glStudio.keepEditing'),
      });
      if (!closeAnyway) return false;
      abandonUploads();
      if (imageUrls.length > 0 && !(await flushOrConfirm(true))) return false;
      closeEditor();
      return true;
    }
    if (imageUrls.length === 0 && (title.trim() || description.trim())) {
      const discard = await showConfirm(t('glStudio.emptySetBody'), {
        title: t('glStudio.emptySetTitle'),
        variant: 'warning',
        confirmLabel: t('glStudio.discard'),
        cancelLabel: t('glStudio.keepEditing'),
      });
      if (discard) closeEditor();
      return discard;
    }
    if (!(await flushOrConfirm())) return false;
    closeEditor();
    return true;
  }, [editorState, showConfirm, t, flushOrConfirm, closeEditor]);

  // Hub targets that happen outside the Studio close it first.
  const leaveThen = useCallback(
    (next: () => void) => {
      void requestClose().then((closed) => {
        if (closed) next();
      });
    },
    [requestClose]
  );

  // The runner loads the saved set, so an unsaved draft never starts.
  const runLive = useCallback(async () => {
    if (conflict || !(await autosave.flush())) {
      addToast?.(t('glStudio.runLiveFailed'), 'error');
      return;
    }
    closeEditor();
    requestStartTour({ setId: set.id });
  }, [conflict, autosave, addToast, t, closeEditor, set.id]);

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
    deleteImage,
    duplicateStep,
    duplicateSlide,
    copySteps,
    pasteSteps,
    currentImageIndex,
    imageUrls,
    undo,
    redo,
    undoIfLatest,
    canUndo,
    canRedo,
    clipboardStepCount,
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

  // Every delete is undoable from its toast; none asks first.
  const toastUndoFor = useCallback(
    (tag: object) => () => {
      if (!undoIfLatest(tag)) addToast?.(t('glStudio.undoFromHeader'), 'info');
    },
    [undoIfLatest, addToast, t]
  );
  const deleteStepWithUndo = useCallback(
    (id: string) => {
      const tag = {};
      const n = steps.findIndex((s) => s.id === id) + 1;
      deleteStep(id, tag);
      addToast?.(t('glStudio.stepDeleted', { n }), 'info', {
        label: t('glStudio.undo'),
        onClick: toastUndoFor(tag),
      });
    },
    [steps, deleteStep, addToast, t, toastUndoFor]
  );
  const deleteSlideWithUndo = useCallback(
    (index: number) => {
      const tag = {};
      deleteImage(index, tag);
      addToast?.(t('glStudio.slideDeleted', { n: index + 1 }), 'info', {
        label: t('glStudio.undo'),
        onClick: toastUndoFor(tag),
      });
    },
    [deleteImage, addToast, t, toastUndoFor]
  );
  const deleteSelected = useCallback(() => {
    if (selectedStepId) deleteStepWithUndo(selectedStepId);
  }, [selectedStepId, deleteStepWithUndo]);

  // With no step selected, the current slide is what Duplicate copies.
  const duplicateSelection = useCallback(() => {
    if (selectedStepId) duplicateStep(selectedStepId);
    else if (imageUrls.length > 0) duplicateSlide(currentImageIndex);
  }, [
    selectedStepId,
    duplicateStep,
    duplicateSlide,
    imageUrls.length,
    currentImageIndex,
  ]);
  const copyStepWithToast = useCallback(
    (id: string) => {
      const count = copySteps([id]);
      if (count > 0) addToast?.(t('glStudio.stepsCopied', { count }), 'info');
    },
    [copySteps, addToast, t]
  );

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
        id: 'duplicate',
        key: 'd',
        mod: true,
        when: () => selectedStepId !== null || imageUrls.length > 0,
        run: duplicateSelection,
      },
      {
        id: 'copy-step',
        key: 'c',
        mod: true,
        // A text selection keeps the browser's own copy.
        when: () => selectedStepId !== null && !hasTextSelection(),
        run: () => {
          if (selectedStepId) copyStepWithToast(selectedStepId);
        },
      },
      {
        id: 'paste-steps',
        key: 'v',
        mod: true,
        // Otherwise the browser's paste runs, so a newer copied image still becomes a slide.
        when: () => imageUrls.length > 0 && stepClipboardIsLatest(),
        run: () => pasteSteps(),
      },
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
      selectedStepId,
      imageUrls.length,
      duplicateSelection,
      copyStepWithToast,
      pasteSteps,
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
  const shortcutsEnabled = !showAiGen && !currentDialog && !readOnly;
  useStudioShortcuts(playing ? playKeymap : editKeymap, {
    // An open dialog owns the keyboard, Escape included; a read-only set takes no edits.
    enabled: shortcutsEnabled,
    editing: !playing && tools.editingStepId !== null,
  });

  // A browser paste with no image in it pastes copied steps, e.g. after the author switched windows.
  const onPasteEvent = useEffectEvent((e: ClipboardEvent) => {
    if (e.defaultPrevented || isTypingTarget(e.target)) return;
    if (tools.editingStepId !== null || imageUrls.length === 0) return;
    const hasFiles = Array.from(e.clipboardData?.files ?? []).some((f) =>
      f.type.startsWith('image/')
    );
    if (hasFiles) return;
    if (pasteSteps() > 0) e.preventDefault();
  });
  const pasteListening = shortcutsEnabled && !playing;
  useEffect(() => {
    if (!pasteListening) return;
    window.addEventListener('paste', onPasteEvent);
    return () => window.removeEventListener('paste', onPasteEvent);
  }, [pasteListening]);

  const canUseAi =
    !!onAiGenerated && isAdmin === true && canAccessFeature('gemini-functions');
  const canRecordTour = isAdmin === true && canAccessFeature('gl-live-tours');

  const canvasDrop = useFileDrop(
    (files) => void editorState.uploadFromFiles(files),
    !playing && !readOnly
  );
  const pasteBlocked =
    typeof navigator === 'undefined' || !navigator.clipboard?.read
      ? t('glStudio.hubPasteUnsupported')
      : clipboardStepCount > 0 && stepClipboardIsLatest()
        ? t('glStudio.hubPasteStepsWaiting')
        : null;

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
        onTitleChange={readOnly ? () => undefined : editorState.setTitle}
        titlePlaceholder={t('glStudio.titlePlaceholder')}
        subtitle={t('glStudio.stepCount', { count: stepCount })}
        notice={
          autosave.error instanceof SetTooLargeError
            ? autosave.error.message
            : editorState.imageUrls.length === 0
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo || readOnly}
                  aria-label={t('glStudio.undo')}
                  title={t('glStudio.undo')}
                  data-testid="gl-studio-undo"
                  className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo || readOnly}
                  aria-label={t('glStudio.redo')}
                  title={t('glStudio.redo')}
                  data-testid="gl-studio-redo"
                  className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Redo2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
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
      {conflict && (
        <div
          role="alert"
          data-testid="gl-studio-conflict"
          className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <strong className="font-bold">{t('glStudio.conflictTitle')}</strong>{' '}
            {t('glStudio.conflictBody')}
          </p>
          <button
            type="button"
            onClick={() => void reloadLatest()}
            disabled={resolving}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {t('glStudio.conflictReload')}
          </button>
          <button
            type="button"
            onClick={() => void overwrite()}
            disabled={resolving}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {t('glStudio.conflictOverwrite')}
          </button>
        </div>
      )}
      {readOnly && (
        <p
          role="status"
          data-testid="gl-studio-read-only"
          className="flex items-center gap-2 border-b border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-700"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('glStudio.newerVersion')}
        </p>
      )}
      <div
        // Read-only sets can still be played from the header.
        inert={readOnly && !playing}
        className="relative grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_360px]"
      >
        <StudioFilmstrip
          state={editorState}
          onDeleteSlide={deleteSlideWithUndo}
        />
        <div className="flex min-h-0 min-w-0 flex-col">
          <main
            ref={canvasRef}
            data-testid="gl-studio-canvas-drop"
            className="relative min-h-0 flex-1 p-6"
            {...canvasDrop.handlers}
          >
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
            ) : imageUrls.length === 0 ? (
              <StudioStartHub
                onFiles={(files) => void editorState.uploadFromFiles(files)}
                onPaste={() => void editorState.uploadFromClipboard()}
                pasteBlocked={pasteBlocked}
                onCapture={() => setCapturing(true)}
                uploadProgress={editorState.uploadProgress}
                onRecordTour={
                  canRecordTour ? () => leaveThen(requestRecordTour) : undefined
                }
                onDraftWithAi={canUseAi ? () => setShowAiGen(true) : undefined}
                onImport={onImport ? () => leaveThen(onImport) : undefined}
              />
            ) : (
              <StudioCanvas
                state={editorState}
                tools={tools}
                setId={set.id}
                preset={preset}
              />
            )}
            {canvasDrop.active && (
              <div
                data-testid="gl-studio-drop-overlay"
                className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-blue-primary bg-white/85 text-sm font-bold text-brand-blue-primary"
              >
                <Upload className="h-6 w-6" aria-hidden="true" />
                {t('glStudio.dropToAdd')}
              </div>
            )}
          </main>
          <StudioTimeline state={editorState} onCopyStep={copyStepWithToast} />
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
            onDeleteStep={deleteStepWithUndo}
            canvasRef={canvasRef}
            aiDrafts={aiDrafts}
            liveTours={!!set.isBuilding && canAccessFeature('gl-live-tours')}
          />
        </aside>
      </div>
      {capturing && (
        <ScreenCaptureModal
          mode="snap"
          onAddMedia={editorState.addCapturedMedia}
          onClose={() => setCapturing(false)}
        />
      )}
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
