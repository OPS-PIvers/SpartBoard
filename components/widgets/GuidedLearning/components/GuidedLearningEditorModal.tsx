/**
 * GuidedLearningEditorModal — full-screen modal wrapping the existing
 * GuidedLearningEditor in headless mode. Adds EditorModalShell chrome
 * (sticky header/footer, dirty-guard, save spinner) while delegating
 * the complex editor body (image viewport, hotspot placement, step
 * editing) to the existing component unchanged.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  GuidedLearningMode,
  GuidedLearningQuestion,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  GuidedLearningStep,
} from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import {
  GuidedLearningEditor,
  GuidedLearningEditorState,
} from './GuidedLearningEditor';

interface GuidedLearningEditorModalProps {
  isOpen: boolean;
  set: GuidedLearningSet | null;
  meta: GuidedLearningSetMetadata | null;
  onClose: () => void;
  onSave: (set: GuidedLearningSet, driveFileId?: string) => Promise<void>;
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
      !!sa.hideStepNumber !== !!sb.hideStepNumber
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
> = ({ isOpen, set, meta, onClose, onSave }) => {
  // Track live state from the headless editor via onStateChange callback
  const [liveState, setLiveState] = useState<GuidedLearningEditorState | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  // Snapshot originals when `set` identity changes
  const originalTitle = set?.title ?? '';
  const originalDescription = set?.description ?? '';
  const originalMode: GuidedLearningMode = set?.mode ?? 'structured';
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
  }

  // Stable callback for the editor
  const handleStateChange = useCallback((state: GuidedLearningEditorState) => {
    setLiveState(state);
  }, []);

  // Dirty check
  const isDirty = useMemo(() => {
    if (!liveState) return false;
    return (
      liveState.title !== originalTitle ||
      liveState.description !== originalDescription ||
      liveState.mode !== originalMode ||
      !arraysEqual(liveState.imageUrls, originalImageUrls) ||
      !stepsEqual(liveState.steps, originalSteps)
    );
  }, [
    liveState,
    originalTitle,
    originalDescription,
    originalMode,
    originalImageUrls,
    originalSteps,
  ]);

  // Save
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
      };
      await onSave(builtSet, meta?.driveFileId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Derive modal title from live state
  const displayTitle = liveState?.title.trim()
    ? liveState.title.trim()
    : originalTitle
      ? 'Edit Set'
      : 'New Set';

  const stepCount = liveState?.steps.length ?? set?.steps.length ?? 0;

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={displayTitle}
      subtitle={
        <span>
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
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
      maxWidth="max-w-6xl"
      className="h-[90vh]"
      bodyClassName="p-0"
    >
      {set && (
        <GuidedLearningEditor
          existingSet={set}
          existingMeta={meta}
          onSave={onSave}
          onCancel={onClose}
          saving={saving}
          headless
          onStateChange={handleStateChange}
        />
      )}
    </EditorModalShell>
  );
};
