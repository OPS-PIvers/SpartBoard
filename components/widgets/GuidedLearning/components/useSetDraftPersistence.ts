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
import {
  GuidedLearningSaveConflictError,
  type GuidedLearningSaveGuard,
} from '../utils/saveConflict';
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
  onSave: (
    set: GuidedLearningSet,
    driveFileId?: string,
    guard?: GuidedLearningSaveGuard
  ) => Promise<void>;
  driveFileId?: string;
  /** Stored revision the editor opened on; personal sets pass the metadata doc's. */
  loadedUpdatedAt?: number;
  onClose: () => void;
}

/** Thrown by a save of a set a newer client wrote. */
export class GuidedLearningReadOnlyError extends Error {
  constructor() {
    super('This set was saved by a newer version. Refresh to edit it.');
    this.name = 'GuidedLearningReadOnlyError';
  }
}

/** True when a newer client wrote the set, so this one must not save it. */
export const isNewerSchema = (set: GuidedLearningSet | null): boolean =>
  (set?.schemaVersion ?? 1) > GL_SET_SCHEMA_VERSION;

export interface SetDraftPersistence {
  saving: boolean;
  isDirty: boolean;
  /** New identity on every draft edit; the autosave quiet period restarts on it. */
  draftToken: unknown[];
  /** A nudge, not a gate: autosave writes regardless. */
  incompleteNotice: string | null;
  /** Persist only; the shell owns closing. */
  persistDraft: () => Promise<void>;
  /** The set a save would write right now; null with no set loaded. */
  buildSavedSet: () => GuidedLearningSet | null;
  /** Close, deleting queued media when the latest draft is saved. */
  closeEditor: () => void;
  /** Set when a save found someone else's newer save; autosave should pause. */
  conflict: GuidedLearningSaveConflictError | null;
  /** Makes the next save skip the revision check. */
  armOverwrite: () => void;
  /** A newer client wrote this set, so every save is refused. */
  readOnly: boolean;
}

/** Dirty tracking, legacy radius conversion, save payload and close flush for a GL editor. */
export function useSetDraftPersistence({
  isOpen,
  set,
  editorState,
  onSave,
  driveFileId,
  loadedUpdatedAt,
  onClose,
}: UseSetDraftPersistenceArgs): SetDraftPersistence {
  const { deleteFile, deleteDriveFile } = useStorage();
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] =
    useState<GuidedLearningSaveConflictError | null>(null);
  // Stored revision the next save must find; advances with each save that lands.
  const revisionRef = useRef<number | undefined>(
    loadedUpdatedAt ?? set?.updatedAt
  );
  const overwriteRef = useRef(false);
  const readOnly = isNewerSchema(set);

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
    setConflict(null);
    revisionRef.current = loadedUpdatedAt ?? set?.updatedAt;
    overwriteRef.current = false;
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
      setOriginalSteps(convertedOriginal);
      markSpotlightRadiiV2((steps) =>
        convertLegacySpotlightRadii(steps, measurements)
      );
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

  // The payload a save writes now; the Studio also hands it to the classic editor.
  const buildSavedSet = (): GuidedLearningSet | null => {
    if (!set) return null;
    // Radii were already converted (if possible) at editor load, so saving
    // only stamps v2 when in-editor semantics are v2 (or no step reads a
    // radius); otherwise the set stays legacy — matching the preview.
    const steps = editorState.steps;
    const schemaVersion =
      editorState.spotlightRadiiV2 || !steps.some(stepUsesSpotlight)
        ? GL_SET_SCHEMA_VERSION
        : set.schemaVersion;
    // Editor-owned optional fields are dropped here and re-added below only when set.
    const {
      schemaVersion: _schemaVersion,
      description: _description,
      imageKinds: _imageKinds,
      videoTrims: _videoTrims,
      hotspotPulse: _hotspotPulse,
      imageTransition: _imageTransition,
      welcomeEnabled: _welcomeEnabled,
      welcomeMessage: _welcomeMessage,
      watchPace: _watchPace,
      hasLiveTour: _hasLiveTour,
      slideThumbnails: _slideThumbnails,
      ...carried
    } = set;
    const thumbs = editorState.slideThumbnails ?? set.slideThumbnails ?? {};
    const slideThumbnails = Object.fromEntries(
      editorState.imageUrls.flatMap((url) =>
        thumbs[url] ? [[url, thumbs[url]] as const] : []
      )
    );
    return {
      // Carries imagePaths, tourSetup, helpCenter and fields a newer client added.
      ...carried,
      id: set.id,
      ...(schemaVersion !== undefined ? { schemaVersion } : {}),
      title: editorState.title.trim(),
      description: editorState.description.trim() || undefined,
      imageUrls: editorState.imageUrls,
      ...(Object.keys(slideThumbnails).length > 0 ? { slideThumbnails } : {}),
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
      // The loaded revision; persistDraft stamps the next one.
      updatedAt: revisionRef.current ?? set.updatedAt,
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
      // Launch points read this instead of loading every step.
      ...(set.isBuilding ? { hasLiveTour: steps.some((s) => !!s.tour) } : {}),
    };
  };

  const persistDraft = async () => {
    if (readOnly) throw new GuidedLearningReadOnlyError();
    const builtSet = buildSavedSet();
    if (!builtSet) return;
    const token = draftTokenRef.current;
    const base = revisionRef.current;
    // Strictly newer than the base, so a same-millisecond save still moves the revision.
    const updatedAt = Math.max(Date.now(), (base ?? 0) + 1);
    const guard: GuidedLearningSaveGuard = {
      expectedUpdatedAt: overwriteRef.current ? undefined : base,
    };
    setSaving(true);
    try {
      await onSave({ ...builtSet, updatedAt }, driveFileId, guard);
      revisionRef.current = updatedAt;
      overwriteRef.current = false;
      setConflict(null);
      savedTokenRef.current = token;
    } catch (err) {
      if (err instanceof GuidedLearningSaveConflictError) setConflict(err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const armOverwrite = useCallback(() => {
    overwriteRef.current = true;
  }, []);

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
    buildSavedSet,
    closeEditor,
    conflict,
    armOverwrite,
    readOnly,
  };
}
