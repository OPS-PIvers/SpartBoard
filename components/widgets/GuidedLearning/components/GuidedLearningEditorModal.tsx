/**
 * GuidedLearningEditorModal — full-screen editor for a Guided Learning set.
 *
 * Wraps the two-pane EditorWorkspace: left context pane has the image canvas
 * and hotspot placement; right detail pane has the always-visible step editor
 * for the currently-selected hotspot.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Folder as FolderIcon, Inbox, Info, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  GuidedLearningStep,
  LibraryFolder,
} from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { useAuth } from '@/context/useAuth';
import {
  GuidedLearningEditorContextPane,
  GuidedLearningEditorDetailPane,
} from './GuidedLearningEditor';
import {
  STUDIO_STEP_FIELDS,
  useSetDraftPersistence,
} from './useSetDraftPersistence';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';
import { GuidedLearningAIGenerator } from './GuidedLearningAIGenerator';

interface GuidedLearningEditorModalProps {
  isOpen: boolean;
  set: GuidedLearningSet | null;
  meta: GuidedLearningSetMetadata | null;
  onClose: () => void;
  onSave: (set: GuidedLearningSet, driveFileId?: string) => Promise<void>;
  /**
   * When provided, shows a "Generate with AI" button inside the modal (admin +
   * `gemini-functions` gated). Invoked with the generated set so the parent
   * can replace the in-flight draft (the editor resets when its `set` prop
   * identity changes).
   */
  onAiGenerated?: (set: GuidedLearningSet) => void;
  /** Optional folder picker. When `folders` and `onFolderChange` are both provided, a folder-select field is shown. */
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

const stepUsesStudioFeatures = (step: GuidedLearningStep): boolean =>
  STUDIO_STEP_FIELDS.some((key) => step[key] !== undefined);

// ─── Modal ──────────────────────────────────────────────────────────────────

export const GuidedLearningEditorModal: React.FC<
  GuidedLearningEditorModalProps
> = ({
  isOpen,
  set,
  meta,
  onClose,
  onSave,
  onAiGenerated,
  folders,
  folderId,
  onFolderChange,
}) => {
  const { t } = useTranslation();
  const { isAdmin, canAccessFeature } = useAuth();
  const [showAiGen, setShowAiGen] = useState(false);

  const canUseAi =
    !!onAiGenerated && isAdmin === true && canAccessFeature('gemini-functions');

  // Reset modal-local state when set prop identity changes (the editor hook
  // resets its own draft state on the same identity change).
  const [prevSet, setPrevSet] = useState<GuidedLearningSet | null>(set);
  if (set !== prevSet) {
    setPrevSet(set);
    setShowAiGen(false);
  }

  // The hook is called inside this component, so the modal already re-renders
  // on every editor state change — dirty state and the save payload read the
  // controller's fields directly (no mirrored "live state" copy).
  const editorState = useGuidedLearningEditorState({
    existingSet: set,
    existingMeta: meta,
    folders,
    folderId,
    onFolderChange,
  });

  const {
    saving,
    isDirty,
    draftToken,
    incompleteNotice,
    persistDraft,
    closeEditor,
  } = useSetDraftPersistence({
    isOpen,
    set,
    editorState,
    onSave,
    driveFileId: meta?.driveFileId,
    onClose,
  });

  const usesStudioFeatures = editorState.steps.some(stepUsesStudioFeatures);

  // The header now hosts the editable title input directly. Pass through
  // the live value so users see what they're typing; placeholder kicks in
  // for empty strings.
  const headerTitleValue = editorState.title;
  const titlePlaceholder = set?.title ? 'Edit Set' : 'Set title…';

  const stepCount = editorState.steps.length;

  // Folder picker — surfaced as a compact icon button in the header so
  // it doesn't take a full row in the body. Anchored popover renders
  // when open. Only shown when both `folders` and `onFolderChange` are
  // wired (matches the previous body behavior).
  const folderButtonRef = useRef<HTMLButtonElement>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const folderPickerEnabled = Boolean(folders && onFolderChange);
  const currentFolder =
    folderPickerEnabled && folderId != null
      ? (folders?.find((f) => f.id === folderId) ?? null)
      : null;
  const folderTooltip =
    folderId == null
      ? 'No folder'
      : currentFolder
        ? `Folder: ${currentFolder.name}`
        : 'Folder not found';

  // Stable chrome elements so the shell's memoized header/footer don't
  // re-render on step-editor keystrokes.
  const subtitle = useMemo(
    () => (
      <span>
        {stepCount} {stepCount === 1 ? 'step' : 'steps'}
      </span>
    ),
    [stepCount]
  );
  const headerExtras = useMemo(
    () =>
      folderPickerEnabled ? (
        <button
          ref={folderButtonRef}
          type="button"
          onClick={() => setFolderPickerOpen((v) => !v)}
          title={folderTooltip}
          aria-label={folderTooltip}
          aria-expanded={folderPickerOpen}
          aria-haspopup="dialog"
          className={`inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 ${
            folderId != null ? 'text-brand-blue-primary' : ''
          }`}
        >
          {folderId == null ? (
            <Inbox className="h-5 w-5" />
          ) : (
            <FolderIcon className="h-5 w-5" />
          )}
        </button>
      ) : null,
    [folderPickerEnabled, folderTooltip, folderPickerOpen, folderId]
  );
  const footerExtras = useMemo(
    () =>
      canUseAi ? (
        <button
          onClick={() => setShowAiGen(true)}
          className="h-[36px] px-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
          title="Generate with AI (Admin)"
        >
          <Sparkles className="w-4 h-4" />
          Draft with AI
        </button>
      ) : null,
    [canUseAi]
  );

  if (!set) return null;

  return (
    <>
      <EditorWorkspace
        key={set.id}
        isOpen={isOpen}
        title={headerTitleValue}
        onTitleChange={editorState.setTitle}
        titlePlaceholder={titlePlaceholder}
        subtitle={subtitle}
        headerExtras={headerExtras}
        isDirty={isDirty}
        isSaving={saving}
        onSave={persistDraft}
        autosave={{
          draftToken,
          resetKey: set?.id,
          // A set with no slide has nothing to persist, and an in-flight
          // upload would be written as a half-set.
          enabled: editorState.imageUrls.length > 0 && !editorState.uploading,
        }}
        onClose={closeEditor}
        saveLabel="Save Set"
        incompleteNotice={incompleteNotice}
        saveDisabled={
          !editorState.title.trim() ||
          editorState.imageUrls.length === 0 ||
          editorState.uploading
        }
        footerExtras={footerExtras}
        className="h-[90vh]"
        contextRatio={58}
        contextPane={<GuidedLearningEditorContextPane state={editorState} />}
        detailPane={
          <>
            {usesStudioFeatures && (
              <p
                role="note"
                className="flex items-start gap-2 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-600"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('glStudio.classicEditorNotice')}
              </p>
            )}
            <GuidedLearningEditorDetailPane state={editorState} />
          </>
        }
        overlay={
          showAiGen && canUseAi ? (
            <GuidedLearningAIGenerator
              onClose={() => setShowAiGen(false)}
              onGenerated={(generated) => {
                setShowAiGen(false);
                onAiGenerated?.(generated);
              }}
            />
          ) : null
        }
      />
      {folderPickerEnabled && folderPickerOpen && (
        <FolderPickerPopover
          variant="popover"
          anchorRef={folderButtonRef}
          folders={folders ?? []}
          selectedFolderId={folderId ?? null}
          onSelect={(next) => onFolderChange?.(next)}
          onClose={() => setFolderPickerOpen(false)}
          title="Select folder"
        />
      )}
    </>
  );
};
