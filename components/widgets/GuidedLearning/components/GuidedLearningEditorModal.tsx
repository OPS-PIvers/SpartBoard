/**
 * GuidedLearningEditorModal — full-screen editor for a Guided Learning set.
 *
 * Wraps the two-pane EditorWorkspace: left context pane has the image canvas
 * and hotspot placement; right detail pane has the always-visible step editor
 * for the currently-selected hotspot.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Folder as FolderIcon, Inbox, Sparkles } from 'lucide-react';
import {
  GuidedLearningMode,
  GuidedLearningQuestion,
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
  GuidedLearningEditorState,
  useGuidedLearningEditorState,
} from './useGuidedLearningEditorState';
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

// ─── Deep equality helpers ──────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function matchingPairsEqual(
  a: { left: string; right: string }[],
  b: { left: string; right: string }[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].left !== b[i].left || a[i].right !== b[i].right) return false;
  }
  return true;
}

function questionsEqual(
  a: GuidedLearningQuestion | undefined,
  b: GuidedLearningQuestion | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type || a.text !== b.text) return false;
  if ((a.correctAnswer ?? '') !== (b.correctAnswer ?? '')) return false;
  if (!arraysEqual(a.choices ?? [], b.choices ?? [])) return false;
  if (!matchingPairsEqual(a.matchingPairs ?? [], b.matchingPairs ?? []))
    return false;
  if (!arraysEqual(a.sortingItems ?? [], b.sortingItems ?? [])) return false;
  return true;
}

function stepsEqual(a: GuidedLearningStep[], b: GuidedLearningStep[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (
      sa.id !== sb.id ||
      sa.xPct !== sb.xPct ||
      sa.yPct !== sb.yPct ||
      sa.imageIndex !== sb.imageIndex ||
      sa.interactionType !== sb.interactionType ||
      (sa.text ?? '') !== (sb.text ?? '') ||
      (sa.audioUrl ?? '') !== (sb.audioUrl ?? '') ||
      (sa.videoUrl ?? '') !== (sb.videoUrl ?? '') ||
      (sa.label ?? '') !== (sb.label ?? '') ||
      (sa.showOverlay ?? 'none') !== (sb.showOverlay ?? 'none') ||
      (sa.tooltipPosition ?? 'auto') !== (sb.tooltipPosition ?? 'auto') ||
      (sa.tooltipOffset ?? 12) !== (sb.tooltipOffset ?? 12) ||
      (sa.panZoomScale ?? 2.5) !== (sb.panZoomScale ?? 2.5) ||
      (sa.spotlightRadius ?? 25) !== (sb.spotlightRadius ?? 25) ||
      (sa.bannerTone ?? 'blue') !== (sb.bannerTone ?? 'blue') ||
      (sa.autoAdvanceDuration ?? 0) !== (sb.autoAdvanceDuration ?? 0) ||
      !!sa.hideStepNumber !== !!sb.hideStepNumber ||
      !!sa.hotspotAlwaysHidden !== !!sb.hotspotAlwaysHidden
    ) {
      return false;
    }
    if (!questionsEqual(sa.question, sb.question)) return false;
  }
  return true;
}

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
  const { isAdmin, canAccessFeature } = useAuth();
  const [liveState, setLiveState] = useState<GuidedLearningEditorState | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [showAiGen, setShowAiGen] = useState(false);

  const canUseAi =
    !!onAiGenerated && isAdmin === true && canAccessFeature('gemini-functions');

  // Snapshot originals when `set` identity changes
  const originalTitle = set?.title ?? '';
  const originalDescription = set?.description ?? '';
  const originalMode: GuidedLearningMode = set?.mode ?? 'structured';
  const originalHotspotPulse: 'consistent' | 'reminder' | 'off' =
    set?.hotspotPulse ?? 'consistent';
  const originalImageTransition: 'none' | 'slide' | 'fade' =
    set?.imageTransition ?? 'none';
  const originalWelcomeEnabled = Boolean(set?.welcomeEnabled);
  const originalWelcomeMessage = set?.welcomeMessage ?? '';
  const originalImageUrls = useMemo(
    () => (set ? [...set.imageUrls] : []),
    [set]
  );
  const originalSteps = useMemo(
    () => (set ? structuredClone(set.steps) : []),
    [set]
  );

  // Reset live state when set prop identity changes
  const [prevSet, setPrevSet] = useState<GuidedLearningSet | null>(set);
  if (set !== prevSet) {
    setPrevSet(set);
    setLiveState(null);
    setSaving(false);
    setShowAiGen(false);
  }

  const handleStateChange = useCallback((state: GuidedLearningEditorState) => {
    setLiveState(state);
  }, []);

  const editorState = useGuidedLearningEditorState({
    existingSet: set,
    existingMeta: meta,
    onStateChange: handleStateChange,
    folders,
    folderId,
    onFolderChange,
  });

  const isDirty = useMemo(() => {
    if (!liveState) return false;
    return (
      liveState.title !== originalTitle ||
      liveState.description !== originalDescription ||
      liveState.mode !== originalMode ||
      liveState.hotspotPulse !== originalHotspotPulse ||
      liveState.imageTransition !== originalImageTransition ||
      liveState.welcomeEnabled !== originalWelcomeEnabled ||
      liveState.welcomeMessage !== originalWelcomeMessage ||
      !arraysEqual(liveState.imageUrls, originalImageUrls) ||
      !stepsEqual(liveState.steps, originalSteps)
    );
  }, [
    liveState,
    originalTitle,
    originalDescription,
    originalMode,
    originalHotspotPulse,
    originalImageTransition,
    originalWelcomeEnabled,
    originalWelcomeMessage,
    originalImageUrls,
    originalSteps,
  ]);

  const handleSave = async () => {
    if (!set || !liveState) return;
    setSaving(true);
    try {
      const now = Date.now();
      const builtSet: GuidedLearningSet = {
        id: set.id,
        title: liveState.title.trim(),
        description: liveState.description.trim() || undefined,
        imageUrls: liveState.imageUrls,
        steps: liveState.steps,
        mode: liveState.mode,
        createdAt: set.createdAt,
        updatedAt: now,
        isBuilding: set.isBuilding,
        authorUid: set.authorUid,
        // Only persist a hotspotPulse value when it differs from the default
        // ('consistent') — keeps untouched legacy sets clean of new fields.
        ...(liveState.hotspotPulse !== 'consistent'
          ? { hotspotPulse: liveState.hotspotPulse }
          : {}),
        ...(liveState.imageTransition !== 'none'
          ? { imageTransition: liveState.imageTransition }
          : {}),
        // Welcome screen — only persist when actually enabled WITH content.
        // Toggle-on-but-empty falls back to default behavior at render time
        // anyway, so don't write the field; this also avoids cluttering
        // legacy sets that have never touched welcome settings.
        ...(liveState.welcomeEnabled && liveState.welcomeMessage.trim()
          ? {
              welcomeEnabled: true,
              welcomeMessage: liveState.welcomeMessage,
            }
          : {}),
      };
      await onSave(builtSet, meta?.driveFileId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // The header now hosts the editable title input directly. Pass through
  // the live value so users see what they're typing; placeholder kicks in
  // for empty strings.
  const headerTitleValue = liveState?.title ?? originalTitle ?? '';
  const titlePlaceholder = originalTitle ? 'Edit Set' : 'Set title…';

  const stepCount = liveState?.steps.length ?? set?.steps.length ?? 0;

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

  if (!set) return null;

  return (
    <>
      <EditorWorkspace
        key={set.id}
        isOpen={isOpen}
        title={headerTitleValue}
        onTitleChange={editorState.setTitle}
        titlePlaceholder={titlePlaceholder}
        subtitle={
          <span>
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
        }
        headerExtras={
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
          ) : null
        }
        isDirty={isDirty}
        isSaving={saving}
        onSave={handleSave}
        onClose={onClose}
        saveLabel="Save Set"
        saveDisabled={
          !liveState ||
          !liveState.title.trim() ||
          liveState.imageUrls.length === 0 ||
          liveState.uploading
        }
        footerExtras={
          canUseAi ? (
            <button
              onClick={() => setShowAiGen(true)}
              className="h-[36px] px-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
              title="Generate with AI (Admin)"
            >
              <Sparkles className="w-4 h-4" />
              Draft with AI
            </button>
          ) : null
        }
        className="h-[90vh]"
        contextRatio={58}
        contextPane={<GuidedLearningEditorContextPane state={editorState} />}
        detailPane={<GuidedLearningEditorDetailPane state={editorState} />}
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
      {showAiGen && canUseAi && (
        <GuidedLearningAIGenerator
          onClose={() => setShowAiGen(false)}
          onGenerated={(generated) => {
            setShowAiGen(false);
            onAiGenerated?.(generated);
          }}
        />
      )}
    </>
  );
};
