import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GuidedLearningMode,
  GuidedLearningQuestion,
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningVideoTrim,
} from '@/types';
import { useStorage } from '@/hooks/useStorage';
import {
  GL_SET_SCHEMA_VERSION,
  SlideMeasurement,
  convertLegacySpotlightRadii,
  stepUsesSpotlight,
} from '../utils/setMigration';
import { calculateImageFootprint, toImageOffset } from '../utils/imageUtils';
import type { GuidedLearningEditorController } from './useGuidedLearningEditorState';

function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function trimsEqual(
  a: (GuidedLearningVideoTrim | null)[],
  b: (GuidedLearningVideoTrim | null)[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ta = a[i];
    const tb = b[i];
    if (ta === null || tb === null) {
      if (ta !== tb) return false;
    } else if (ta.start !== tb.start || ta.end !== tb.end) {
      return false;
    }
  }
  return true;
}

function matchingPairsEqual(
  a: { left: string; right: string }[],
  b: { left: string; right: string }[]
): boolean {
  if (a === b) return true;
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

// Studio fields are small nested objects, so a JSON compare is enough.
function studioFieldsEqual(a: GuidedLearningStep, b: GuidedLearningStep) {
  return STUDIO_STEP_FIELDS.every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key])
  );
}

// Step fields only the Studio edits; drives dirty checks and the classic editor's notice.
export const STUDIO_STEP_FIELDS = [
  'region',
  'calloutPin',
  'cursor',
  'narration',
  'tour',
] as const satisfies readonly (keyof GuidedLearningStep)[];

function stepsEqual(a: GuidedLearningStep[], b: GuidedLearningStep[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (sa === sb) continue;
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
    if (!studioFieldsEqual(sa, sb)) return false;
  }
  return true;
}

/** Load an image URL's natural dimensions; null on failure or 10s timeout. */
function loadNaturalImageSize(
  url: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10_000);
    const img = new Image();
    img.onload = () => {
      clearTimeout(timer);
      resolve(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null
      );
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

interface UseSetDraftPersistenceArgs {
  isOpen: boolean;
  set: GuidedLearningSet | null;
  editorState: GuidedLearningEditorController;
  onSave: (set: GuidedLearningSet, driveFileId?: string) => Promise<void>;
  driveFileId?: string;
  onClose: () => void;
}

export interface SetDraftPersistence {
  saving: boolean;
  isDirty: boolean;
  /** New identity on every draft edit; the autosave quiet period restarts on it. */
  draftToken: unknown[];
  /** A nudge, not a gate: autosave writes regardless. */
  incompleteNotice: string | null;
  /** Persist only; the shell owns closing. */
  persistDraft: () => Promise<void>;
  /** Close, deleting queued media when the latest draft is saved. */
  closeEditor: () => void;
}

/** Dirty tracking, legacy radius conversion, save payload and close flush for a GL editor. */
export function useSetDraftPersistence({
  isOpen,
  set,
  editorState,
  onSave,
  driveFileId,
  onClose,
}: UseSetDraftPersistenceArgs): SetDraftPersistence {
  const { deleteFile, deleteDriveFile } = useStorage();
  const [saving, setSaving] = useState(false);

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
  // Normalized per-slide kinds (missing entries = 'image') so dirty
  // comparison is stable for legacy sets without the field.
  const originalImageKinds = useMemo(
    () =>
      set ? set.imageUrls.map((_, i) => set.imageKinds?.[i] ?? 'image') : [],
    [set]
  );
  // Normalized per-slide trims (missing entries = null) for stable dirty
  // comparison on legacy sets without the field.
  const originalVideoTrims = useMemo(
    () => (set ? set.imageUrls.map((_, i) => set.videoTrims?.[i] ?? null) : []),
    [set]
  );
  // State (not memo): the legacy radius conversion rebases it so an
  // untouched-but-converted set still reads as clean.
  const [originalSteps, setOriginalSteps] = useState<GuidedLearningStep[]>(
    () => (set ? structuredClone(set.steps) : [])
  );

  const originalWatchPace = set?.watchPace;

  const [prevSet, setPrevSet] = useState<GuidedLearningSet | null>(set);
  if (set !== prevSet) {
    setPrevSet(set);
    setSaving(false);
    setOriginalSteps(set ? structuredClone(set.steps) : []);
  }

  // Without a slide the editor cannot save at all, so that comes first.
  const incompleteNotice = useMemo(() => {
    if (editorState.imageUrls.length === 0) return 'Add at least one slide';
    if (!editorState.title.trim()) return 'Set title is required';
    return null;
  }, [editorState.imageUrls.length, editorState.title]);

  const isDirty = useMemo(() => {
    return (
      editorState.title !== originalTitle ||
      editorState.description !== originalDescription ||
      editorState.mode !== originalMode ||
      editorState.hotspotPulse !== originalHotspotPulse ||
      editorState.imageTransition !== originalImageTransition ||
      editorState.welcomeEnabled !== originalWelcomeEnabled ||
      editorState.welcomeMessage !== originalWelcomeMessage ||
      !arraysEqual(editorState.imageUrls, originalImageUrls) ||
      !arraysEqual(editorState.imageKinds, originalImageKinds) ||
      !trimsEqual(editorState.videoTrims, originalVideoTrims) ||
      !stepsEqual(editorState.steps, originalSteps) ||
      editorState.watchPace !== originalWatchPace
    );
  }, [
    editorState.title,
    editorState.description,
    editorState.mode,
    editorState.hotspotPulse,
    editorState.imageTransition,
    editorState.welcomeEnabled,
    editorState.welcomeMessage,
    editorState.imageUrls,
    editorState.imageKinds,
    editorState.videoTrims,
    editorState.steps,
    editorState.watchPace,
    originalTitle,
    originalDescription,
    originalMode,
    originalHotspotPulse,
    originalImageTransition,
    originalWelcomeEnabled,
    originalWelcomeMessage,
    originalImageUrls,
    originalImageKinds,
    originalVideoTrims,
    originalSteps,
    originalWatchPace,
  ]);

  // One-time v1→v2 radius conversion at editor load: convert every spotlight
  // radius to image-relative as soon as measurements exist (retried on each
  // canvas measurement), then flip spotlightRadiiV2 so the preview and save
  // both use v2 semantics. Until then the preview renders legacy semantics,
  // and an unmeasurable set stays legacy on save.
  const {
    steps: draftSteps,
    setSteps,
    imageUrls,
    imageKinds,
    canvasMeasurementsRef,
    canvasMeasuredTick,
    spotlightRadiiV2,
    markSpotlightRadiiV2,
  } = editorState;
  useEffect(() => {
    if (!isOpen || !set || spotlightRadiiV2) return;
    let cancelled = false;
    // Per-slide footprints; null when any spotlight step's slide is unmeasured.
    const gather = async (): Promise<Map<number, SlideMeasurement> | null> => {
      const measurements = new Map<number, SlideMeasurement>();
      const needed = new Set(
        [...draftSteps, ...originalSteps]
          .filter(stepUsesSpotlight)
          .map((s) => s.imageIndex)
      );
      if (needed.size === 0) return measurements;
      const canvas = canvasMeasurementsRef.current;
      if (!canvas) return null;
      for (const i of needed) {
        const url = imageUrls[i];
        if (!url) return null;
        let dims = canvas.naturalDims.get(url) ?? null;
        if (!dims && (imageKinds[i] ?? 'image') === 'image') {
          dims = await loadNaturalImageSize(url);
        }
        if (!dims) return null;
        const imgOffset = toImageOffset(
          calculateImageFootprint(
            dims.width,
            dims.height,
            canvas.containerWidth,
            canvas.containerHeight
          ),
          canvas.containerWidth,
          canvas.containerHeight
        );
        if (!imgOffset) return null;
        measurements.set(i, {
          imgOffset,
          containerWidth: canvas.containerWidth,
          containerHeight: canvas.containerHeight,
        });
      }
      return measurements;
    };
    void (async () => {
      const measurements = await gather();
      if (cancelled || !measurements) return;
      const convertedDraft = convertLegacySpotlightRadii(
        draftSteps,
        measurements
      );
      const convertedOriginal = convertLegacySpotlightRadii(
        originalSteps,
        measurements
      );
      if (!convertedDraft || !convertedOriginal) return;
      setSteps(convertedDraft);
      setOriginalSteps(convertedOriginal);
      markSpotlightRadiiV2();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    set,
    spotlightRadiiV2,
    canvasMeasuredTick,
    draftSteps,
    originalSteps,
    imageUrls,
    imageKinds,
    canvasMeasurementsRef,
    setSteps,
    markSpotlightRadiiV2,
  ]);

  // New identity on every draft edit — the autosave quiet period restarts on it.
  const draftToken = useMemo(
    () => [
      editorState.title,
      editorState.description,
      editorState.mode,
      editorState.hotspotPulse,
      editorState.imageTransition,
      editorState.welcomeEnabled,
      editorState.welcomeMessage,
      editorState.imageUrls,
      editorState.imageKinds,
      editorState.videoTrims,
      editorState.steps,
      editorState.watchPace,
    ],
    [
      editorState.title,
      editorState.description,
      editorState.mode,
      editorState.hotspotPulse,
      editorState.imageTransition,
      editorState.welcomeEnabled,
      editorState.welcomeMessage,
      editorState.imageUrls,
      editorState.imageKinds,
      editorState.videoTrims,
      editorState.steps,
      editorState.watchPace,
    ]
  );
  const draftTokenRef = useRef(draftToken);
  draftTokenRef.current = draftToken;
  // Token of the last draft that saved; queued deletions run only if nothing changed since.
  const savedTokenRef = useRef<unknown[] | null>(null);

  const persistDraft = async () => {
    if (!set) return;
    const token = draftTokenRef.current;
    setSaving(true);
    try {
      // Radii were already converted (if possible) at editor load, so saving
      // only stamps v2 when in-editor semantics are v2 (or no step reads a
      // radius); otherwise the set stays legacy — matching the preview.
      const steps = editorState.steps;
      const schemaVersion =
        editorState.spotlightRadiiV2 || !steps.some(stepUsesSpotlight)
          ? GL_SET_SCHEMA_VERSION
          : set.schemaVersion;
      const now = Date.now();
      const builtSet: GuidedLearningSet = {
        id: set.id,
        ...(schemaVersion !== undefined ? { schemaVersion } : {}),
        title: editorState.title.trim(),
        description: editorState.description.trim() || undefined,
        imageUrls: editorState.imageUrls,
        // Only persist kinds when at least one slide is a video — keeps
        // image-only (and legacy) sets free of the new field.
        ...(editorState.imageKinds.some((k) => k === 'video')
          ? { imageKinds: editorState.imageKinds }
          : {}),
        // Only persist trims when at least one slide actually has one —
        // keeps untrimmed (and legacy) sets free of the new field.
        ...(editorState.videoTrims.some(Boolean)
          ? { videoTrims: editorState.videoTrims }
          : {}),
        steps,
        mode: editorState.mode,
        createdAt: set.createdAt,
        updatedAt: now,
        isBuilding: set.isBuilding,
        authorUid: set.authorUid,
        // Only persist a hotspotPulse value when it differs from the default
        // ('consistent') — keeps untouched legacy sets clean of new fields.
        ...(editorState.hotspotPulse !== 'consistent'
          ? { hotspotPulse: editorState.hotspotPulse }
          : {}),
        ...(editorState.imageTransition !== 'none'
          ? { imageTransition: editorState.imageTransition }
          : {}),
        // Welcome screen — only persist when actually enabled WITH content.
        // Toggle-on-but-empty falls back to default behavior at render time
        // anyway, so don't write the field; this also avoids cluttering
        // legacy sets that have never touched welcome settings.
        ...(editorState.welcomeEnabled && editorState.welcomeMessage.trim()
          ? {
              welcomeEnabled: true,
              welcomeMessage: editorState.welcomeMessage,
            }
          : {}),
        ...(editorState.watchPace ? { watchPace: editorState.watchPace } : {}),
        // The classic editor has no tour controls, so tour setup rides through.
        ...(set.tourSetup ? { tourSetup: set.tourSetup } : {}),
      };
      await onSave(builtSet, driveFileId);
      savedTokenRef.current = token;
    } finally {
      setSaving(false);
    }
  };

  const { flushMediaDeletions } = editorState;
  const closeEditor = useCallback(() => {
    if (savedTokenRef.current === draftTokenRef.current) {
      void flushMediaDeletions(deleteFile, deleteDriveFile);
    }
    onClose();
  }, [flushMediaDeletions, deleteFile, deleteDriveFile, onClose]);

  return {
    saving,
    isDirty,
    draftToken,
    incompleteNotice,
    persistDraft,
    closeEditor,
  };
}
