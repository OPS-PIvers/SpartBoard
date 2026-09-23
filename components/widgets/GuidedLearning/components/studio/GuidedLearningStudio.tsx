import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Folder as FolderIcon, Inbox } from 'lucide-react';
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
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { EditorHeader } from '../EditorHeader';
import { GuidedLearningEditorDetailPane } from '../GuidedLearningEditor';
import { GuidedLearningAIGenerator } from '../GuidedLearningAIGenerator';
import { useGuidedLearningEditorState } from '../useGuidedLearningEditorState';
import { useSetDraftPersistence } from '../useSetDraftPersistence';
import type { DevicePreset } from '../../types/stage';
import { StudioCanvas } from './StudioCanvas';
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
}) => {
  const { t } = useTranslation();
  const { isAdmin, canAccessFeature } = useAuth();
  const { showConfirm } = useDialog();
  const addToast = useContext(DashboardContext)?.addToast;
  const [showAiGen, setShowAiGen] = useState(false);
  const [preset, setPreset] = useState<DevicePreset>(loadDevicePreset);

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

  const flushOrConfirm = useCallback(async (): Promise<boolean> => {
    if (await autosave.flush()) return true;
    return showConfirm(t('glStudio.unsavedBody'), {
      title: t('glStudio.unsavedTitle'),
      variant: 'warning',
      confirmLabel: t('glStudio.closeAnyway'),
      cancelLabel: t('glStudio.keepEditing'),
    });
  }, [autosave, showConfirm, t]);

  const requestClose = useCallback(async () => {
    if (await flushOrConfirm()) closeEditor();
  }, [flushOrConfirm, closeEditor]);

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

  const selectStepAt = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;
      setSelectedStepId(step.id);
      setCurrentImageIndex(step.imageIndex);
    },
    [steps, setSelectedStepId, setCurrentImageIndex]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedStepId) return;
    deleteStep(selectedStepId);
    addToast?.(t('glStudio.stepDeleted'), 'info', {
      label: t('glStudio.undo'),
      onClick: undo,
    });
  }, [selectedStepId, deleteStep, addToast, t, undo]);

  const selectedIndex = steps.findIndex((s) => s.id === selectedStepId);
  const keymap = useMemo<StudioShortcut[]>(
    () => [
      { id: 'undo', key: 'z', mod: true, run: undo },
      { id: 'redo', key: 'z', mod: true, shift: true, run: redo },
      { id: 'redo-y', key: 'y', mod: true, run: redo },
      { id: 'delete', key: 'Delete', run: deleteSelected },
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
    ],
    [undo, redo, deleteSelected, selectStepAt, selectedIndex, steps.length]
  );
  useStudioShortcuts(keymap, { enabled: !showAiGen });

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
        autosaveStatus={autosave.status}
        onRetrySave={() => void autosave.flush()}
        onDraftWithAi={canUseAi ? () => setShowAiGen(true) : undefined}
        onOpenClassic={onOpenClassic ? () => void openClassic() : undefined}
        onClose={() => void requestClose()}
        extras={
          <>
            <DevicePresetPicker preset={preset} onChange={choosePreset} />
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
      <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)_360px]">
        <nav
          aria-label={t('glStudio.slides')}
          className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-3 custom-scrollbar"
        >
          <ol className="flex flex-col gap-2">
            {editorState.imageUrls.map((url, i) => (
              <li key={`${url}-${i}`}>
                <button
                  type="button"
                  onClick={() => setCurrentImageIndex(i)}
                  aria-current={i === editorState.currentImageIndex}
                  aria-label={t('glStudio.slideN', { n: i + 1 })}
                  className={`relative block w-full overflow-hidden rounded-lg border-2 bg-slate-900 aspect-video ${
                    i === editorState.currentImageIndex
                      ? 'border-brand-blue-primary'
                      : 'border-transparent hover:border-slate-300'
                  }`}
                >
                  {editorState.imageKinds[i] === 'video' ? (
                    <video
                      src={url}
                      muted
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  )}
                  <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 text-xxs font-bold text-white">
                    {i + 1}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <main className="min-h-0 min-w-0 p-6">
          <StudioCanvas state={editorState} setId={set.id} preset={preset} />
        </main>
        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white custom-scrollbar">
          <GuidedLearningEditorDetailPane state={editorState} />
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
