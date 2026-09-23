import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import {
  GuidedLearningSet,
  GuidedLearningMode,
  GuidedLearningStep,
  GuidedLearningSetMetadata,
  GuidedLearningVideoTrim,
  GuidedLearningWatchPace,
  LibraryFolder,
} from '@/types';
import type { EditorHistoryApi } from '../types/stage';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { isGuidedLearningSetV2 } from '../utils/setMigration';
import {
  getMediaKind,
  prepareImageForUpload,
  validateSlideFile,
  videoExtensionForMime,
  type GuidedLearningMediaKind,
} from '@/utils/guidedLearningMedia';
import {
  documentFromSet,
  editorHistoryReducer,
  initialHistory,
  pendingMediaDeletions,
  type EditorDocument,
  type MediaDeletionRef,
} from './editorHistory';

/** Live progress for the slide-upload pipeline (null when idle). */
export interface SlideUploadProgress {
  /** 1-based index of the file currently uploading. */
  current: number;
  total: number;
  fileName: string;
  /** 0–100 within the current file; null when the backend can't report. */
  percent: number | null;
}

/** Canvas container size + per-slide-URL natural dims, written by the canvas as slides render. */
export interface GuidedLearningCanvasMeasurements {
  containerWidth: number;
  containerHeight: number;
  naturalDims: Map<string, { width: number; height: number }>;
}

interface UseGuidedLearningEditorStateProps {
  existingSet: GuidedLearningSet | null;
  existingMeta: GuidedLearningSetMetadata | null;
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

export interface GuidedLearningEditorController extends EditorHistoryApi {
  // Form fields
  title: string;
  setTitle: (next: string) => void;
  description: string;
  setDescription: (next: string) => void;
  mode: GuidedLearningMode;
  setMode: (next: GuidedLearningMode) => void;
  // Display settings
  hotspotPulse: 'consistent' | 'reminder' | 'off';
  setHotspotPulse: (next: 'consistent' | 'reminder' | 'off') => void;
  imageTransition: 'none' | 'slide' | 'fade';
  setImageTransition: (next: 'none' | 'slide' | 'fade') => void;
  welcomeEnabled: boolean;
  setWelcomeEnabled: (next: boolean) => void;
  welcomeMessage: string;
  setWelcomeMessage: (next: string) => void;
  /** Watch-mode pacing; undefined = standard. */
  watchPace: GuidedLearningWatchPace | undefined;
  setWatchPace: (next: GuidedLearningWatchPace | undefined) => void;
  // Slides (images, GIFs, and uploaded/recorded videos)
  imageUrls: string[];
  imageKinds: GuidedLearningMediaKind[];
  videoTrims: (GuidedLearningVideoTrim | null)[];
  /** Set/clear the playback-range trim for a video slide. */
  setVideoTrim: (index: number, trim: GuidedLearningVideoTrim | null) => void;
  currentImageIndex: number;
  setCurrentImageIndex: (next: number) => void;
  uploading: boolean;
  uploadProgress: SlideUploadProgress | null;
  uploadFromFiles: (files: File[]) => Promise<void>;
  uploadFromClipboard: () => Promise<void>;
  /** Add an editor-captured blob (screen snap / recording) as a new slide. */
  addCapturedMedia: (
    blob: Blob,
    kind: GuidedLearningMediaKind,
    baseName: string
  ) => Promise<void>;
  deleteImage: (index: number) => void;
  moveImage: (fromIndex: number, direction: -1 | 1) => void;
  /** Reorder slides; `order[i]` is the old index of the slide now at `i`. */
  reorderImages: (order: number[]) => void;
  imageError: string;
  // Steps
  steps: GuidedLearningStep[];
  setSteps: React.Dispatch<React.SetStateAction<GuidedLearningStep[]>>;
  selectedStepId: string | null;
  setSelectedStepId: (id: string | null) => void;
  addingStep: boolean;
  setAddingStep: (next: boolean) => void;
  addStepAt: (xPct: number, yPct: number) => void;
  updateStep: (updated: GuidedLearningStep) => void;
  deleteStep: (id: string) => void;
  /** Apply a new ordering of the entire steps array (e.g. from drag-reorder). */
  reorderSteps: (next: GuidedLearningStep[]) => void;
  // Folder picker
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  // Derived data
  selectedStep: GuidedLearningStep | null;
  currentImageSteps: GuidedLearningStep[];
  /** Written by the canvas on measure; read at load for legacy radius migration. */
  canvasMeasurementsRef: React.MutableRefObject<GuidedLearningCanvasMeasurements | null>;
  /** Bumped by the canvas after each measurement write so the modal can retry conversion. */
  canvasMeasuredTick: number;
  notifyCanvasMeasured: () => void;
  /** True once in-editor spotlight radii use v2 image-relative semantics. */
  spotlightRadiiV2: boolean;
  markSpotlightRadiiV2: () => void;
  /** Deletes every queued file whose edit is still in effect; call after a closing save. */
  flushMediaDeletions: (
    deleteFile: (storagePath: string) => Promise<void>,
    deleteDriveFile: (fileId: string) => Promise<void>
  ) => Promise<void>;
}

/**
 * Owns all state for the Guided Learning editor. Returned as a controller
 * object that the modal hands to the context + detail pane components.
 */
export function useGuidedLearningEditorState({
  existingSet,
  folders,
  folderId,
  onFolderChange,
}: UseGuidedLearningEditorStateProps): GuidedLearningEditorController {
  const { user } = useAuth();
  const { uploading, uploadHotspotImage, uploadGuidedLearningMedia } =
    useStorage();

  const [history, dispatch] = useReducer(
    editorHistoryReducer,
    existingSet,
    (set) => initialHistory(documentFromSet(set))
  );
  const historyRef = useRef(history);
  historyRef.current = history;
  const {
    title,
    description,
    mode,
    imageUrls,
    imageKinds,
    videoTrims,
    steps,
    hotspotPulse,
    imageTransition,
    welcomeEnabled,
    welcomeMessage,
    watchPace,
  } = history.present;

  const applyDoc = useCallback(
    (update: (doc: EditorDocument) => EditorDocument, coalesceKey?: string) =>
      dispatch({ type: 'apply', update, coalesceKey, at: Date.now() }),
    []
  );
  const setField = useCallback(
    <K extends keyof EditorDocument>(
      key: K,
      value: EditorDocument[K],
      coalesceKey?: string
    ) =>
      applyDoc(
        (doc) => (doc[key] === value ? doc : { ...doc, [key]: value }),
        coalesceKey
      ),
    [applyDoc]
  );
  const setTitle = useCallback(
    (next: string) => setField('title', next, 'title'),
    [setField]
  );
  const setDescription = useCallback(
    (next: string) => setField('description', next, 'description'),
    [setField]
  );
  const setMode = useCallback(
    (next: GuidedLearningMode) => setField('mode', next),
    [setField]
  );
  const setHotspotPulse = useCallback(
    (next: 'consistent' | 'reminder' | 'off') => setField('hotspotPulse', next),
    [setField]
  );
  const setImageTransition = useCallback(
    (next: 'none' | 'slide' | 'fade') => setField('imageTransition', next),
    [setField]
  );
  const setWelcomeEnabled = useCallback(
    (next: boolean) => setField('welcomeEnabled', next),
    [setField]
  );
  const setWelcomeMessage = useCallback(
    (next: string) => setField('welcomeMessage', next, 'welcomeMessage'),
    [setField]
  );
  const setWatchPace = useCallback(
    (next: GuidedLearningWatchPace | undefined) => setField('watchPace', next),
    [setField]
  );
  const setSteps = useCallback<
    React.Dispatch<React.SetStateAction<GuidedLearningStep[]>>
  >(
    (action) =>
      applyDoc((doc) => {
        const next = typeof action === 'function' ? action(doc.steps) : action;
        return next === doc.steps ? doc : { ...doc, steps: next };
      }),
    [applyDoc]
  );

  const [rawImageIndex, setCurrentImageIndex] = useState(0);
  // Undo can remove the slide being shown, so clamp on read.
  const currentImageIndex = Math.max(
    0,
    Math.min(rawImageIndex, imageUrls.length - 1)
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [addingStep, setAddingStep] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<SlideUploadProgress | null>(null);
  const [canvasMeasuredTick, setCanvasMeasuredTick] = useState(0);
  const [spotlightRadiiV2, setSpotlightRadiiV2] = useState<boolean>(() =>
    existingSet ? isGuidedLearningSetV2(existingSet) : true
  );

  // Reset all draft state when the underlying set identity changes (parent
  // swapped to a different set). Uses the "adjust state while rendering"
  // pattern so the next render uses fresh values without an extra effect.
  const flushedMediaRef = useRef<Set<MediaDeletionRef>>(new Set());
  const currentSetId = existingSet?.id ?? null;
  const [prevSetId, setPrevSetId] = useState<string | null>(currentSetId);
  if (currentSetId !== prevSetId) {
    setPrevSetId(currentSetId);
    dispatch({ type: 'reset', doc: documentFromSet(existingSet) });
    flushedMediaRef.current = new Set();
    setCurrentImageIndex(0);
    setSelectedStepId(null);
    setImageError('');
    setAddingStep(false);
    setUploadProgress(null);
    setSpotlightRadiiV2(
      existingSet ? isGuidedLearningSetV2(existingSet) : true
    );
  }

  // Render-synced mirror of imageUrls.length so the sequential upload loop
  // (which awaits between appends, letting renders flush) can compute the
  // new last index without putting a side effect inside a state updater.
  const slideCountRef = useRef(imageUrls.length);
  slideCountRef.current = imageUrls.length;

  const appendSlides = useCallback(
    (urls: string[], kinds: GuidedLearningMediaKind[]) => {
      if (urls.length === 0) return;
      applyDoc((doc) => ({
        ...doc,
        imageUrls: [...doc.imageUrls, ...urls],
        imageKinds: [...doc.imageKinds, ...kinds],
        videoTrims: [...doc.videoTrims, ...urls.map(() => null)],
      }));
      // Jump the canvas to the last newly added slide so the teacher can
      // immediately start placing hotspots on it.
      setCurrentImageIndex(slideCountRef.current + urls.length - 1);
    },
    [applyDoc]
  );

  /**
   * Validate, compress, and upload a batch of slide files (images, GIFs,
   * MP4/WebM videos). Files upload sequentially so the progress indicator
   * reads "2 of 5" instead of racing five spinners; each successful file is
   * appended immediately so one bad file doesn't discard the others.
   */
  const uploadFromFiles = useCallback(
    async (files: File[]) => {
      if (!user || files.length === 0) return;
      setImageError('');

      const errors: string[] = [];
      const accepted = files.filter((file) => {
        const error = validateSlideFile(file);
        if (error) errors.push(error);
        return !error;
      });

      try {
        for (let i = 0; i < accepted.length; i++) {
          const file = accepted[i];
          const kind = getMediaKind(file) ?? 'image';
          setUploadProgress({
            current: i + 1,
            total: accepted.length,
            fileName: file.name,
            percent: kind === 'video' ? 0 : null,
          });
          try {
            if (kind === 'video') {
              const { url } = await uploadGuidedLearningMedia(
                user.uid,
                file,
                file.name.replace(/[^\w.-]+/g, '_'),
                (percent) =>
                  setUploadProgress((prev) =>
                    prev ? { ...prev, percent } : prev
                  )
              );
              appendSlides([url], ['video']);
            } else {
              const prepared = await prepareImageForUpload(file);
              const url = await uploadHotspotImage(user.uid, prepared);
              appendSlides([url], ['image']);
            }
          } catch (err) {
            errors.push(
              err instanceof Error
                ? `"${file.name}": ${err.message}`
                : `"${file.name}" failed to upload.`
            );
          }
        }
      } finally {
        setUploadProgress(null);
      }
      if (errors.length > 0) setImageError(errors.join(' '));
    },
    [user, uploadHotspotImage, uploadGuidedLearningMedia, appendSlides]
  );

  const uploadFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'pasted-image.png', { type });
            await uploadFromFiles([file]);
            return;
          }
        }
      }
      setImageError('No image found in clipboard.');
    } catch {
      setImageError(
        'Could not read clipboard. Try Ctrl+V with the editor focused, or use Add media instead.'
      );
    }
  }, [uploadFromFiles]);

  const addCapturedMedia = useCallback(
    async (blob: Blob, kind: GuidedLearningMediaKind, baseName: string) => {
      const ext =
        kind === 'video'
          ? videoExtensionForMime(blob.type)
          : blob.type === 'image/png'
            ? 'png'
            : 'webp';
      const file = new File([blob], `${baseName}.${ext}`, {
        type: blob.type || (kind === 'video' ? 'video/webm' : 'image/png'),
      });
      await uploadFromFiles([file]);
    },
    [uploadFromFiles]
  );

  const setVideoTrim = useCallback(
    (index: number, trim: GuidedLearningVideoTrim | null) => {
      applyDoc((doc) => ({
        ...doc,
        videoTrims: doc.videoTrims.map((existing, i) =>
          i === index ? trim : existing
        ),
      }));
    },
    [applyDoc]
  );

  const deleteImage = useCallback(
    (deleteIndex: number) => {
      const remaining = imageUrls.length - 1;
      applyDoc((doc) => ({
        ...doc,
        imageUrls: doc.imageUrls.filter((_, index) => index !== deleteIndex),
        imageKinds: doc.imageKinds.filter((_, index) => index !== deleteIndex),
        videoTrims: doc.videoTrims.filter((_, index) => index !== deleteIndex),
        steps: doc.steps
          .filter((step) => step.imageIndex !== deleteIndex)
          .map((step) =>
            step.imageIndex > deleteIndex
              ? { ...step, imageIndex: step.imageIndex - 1 }
              : step
          ),
      }));
      setCurrentImageIndex((curr) => {
        if (remaining <= 0) return 0;
        if (curr === deleteIndex) return Math.min(deleteIndex, remaining - 1);
        if (curr > deleteIndex) return curr - 1;
        return curr;
      });
    },
    [imageUrls.length, applyDoc]
  );

  const moveImage = useCallback(
    (fromIndex: number, direction: -1 | 1) => {
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= imageUrls.length) return;
      const swap = <T>(prev: T[]): T[] => {
        const updated = [...prev];
        [updated[fromIndex], updated[toIndex]] = [
          updated[toIndex],
          updated[fromIndex],
        ];
        return updated;
      };
      applyDoc((doc) => ({
        ...doc,
        imageUrls: swap(doc.imageUrls),
        imageKinds: swap(doc.imageKinds),
        videoTrims: swap(doc.videoTrims),
        steps: doc.steps.map((step) => {
          if (step.imageIndex === fromIndex)
            return { ...step, imageIndex: toIndex };
          if (step.imageIndex === toIndex)
            return { ...step, imageIndex: fromIndex };
          return step;
        }),
      }));
      setCurrentImageIndex((prev) => {
        if (prev === fromIndex) return toIndex;
        if (prev === toIndex) return fromIndex;
        return prev;
      });
    },
    [imageUrls.length, applyDoc]
  );

  const reorderImages = useCallback(
    (order: number[]) => {
      if (order.length !== imageUrls.length) return;
      const newIndexOf = new Map(order.map((oldIndex, i) => [oldIndex, i]));
      applyDoc((doc) => ({
        ...doc,
        imageUrls: order.map((i) => doc.imageUrls[i]),
        imageKinds: order.map((i) => doc.imageKinds[i]),
        videoTrims: order.map((i) => doc.videoTrims[i] ?? null),
        steps: doc.steps.map((step) => {
          const next = newIndexOf.get(step.imageIndex);
          return next === undefined || next === step.imageIndex
            ? step
            : { ...step, imageIndex: next };
        }),
      }));
      setCurrentImageIndex((prev) => newIndexOf.get(prev) ?? prev);
    },
    [imageUrls.length, applyDoc]
  );

  const addStepAt = useCallback(
    (xPct: number, yPct: number) => {
      const newStep: GuidedLearningStep = {
        id: crypto.randomUUID(),
        xPct,
        yPct,
        imageIndex: currentImageIndex,
        interactionType: 'text-popover',
        showOverlay: 'none',
        text: '',
      };
      setSteps((prev) => [...prev, newStep]);
      setSelectedStepId(newStep.id);
      setAddingStep(false);
    },
    [currentImageIndex, setSteps]
  );

  const updateStep = useCallback(
    (updated: GuidedLearningStep) =>
      applyDoc(
        (doc) => ({
          ...doc,
          steps: doc.steps.map((s) => (s.id === updated.id ? updated : s)),
        }),
        `step:${updated.id}`
      ),
    [applyDoc]
  );

  const deleteStep = useCallback(
    (id: string) => {
      setSteps((prev) => prev.filter((s) => s.id !== id));
      if (selectedStepId === id) setSelectedStepId(null);
    },
    [selectedStepId, setSteps]
  );

  const reorderSteps = useCallback(
    (next: GuidedLearningStep[]) => setSteps(next),
    [setSteps]
  );

  const canvasMeasurementsRef = useRef<GuidedLearningCanvasMeasurements | null>(
    null
  );

  const notifyCanvasMeasured = useCallback(
    () => setCanvasMeasuredTick((t) => t + 1),
    []
  );

  // The load-time radius conversion is not an edit: undoing past it would
  // restore legacy radii under v2 semantics.
  const markSpotlightRadiiV2 = useCallback(() => {
    setSpotlightRadiiV2(true);
    dispatch({ type: 'clearHistory' });
  }, []);

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const beginGesture = useCallback(
    () => dispatch({ type: 'beginGesture' }),
    []
  );
  const endGesture = useCallback(() => dispatch({ type: 'endGesture' }), []);
  const queueMediaDeletion = useCallback(
    (ref: MediaDeletionRef) => dispatch({ type: 'queueMedia', ref }),
    []
  );
  const flushMediaDeletions = useCallback(
    async (
      deleteFile: (storagePath: string) => Promise<void>,
      deleteDriveFile: (fileId: string) => Promise<void>
    ) => {
      const pending = pendingMediaDeletions(historyRef.current).filter(
        (ref) => !flushedMediaRef.current.has(ref)
      );
      for (const ref of pending) flushedMediaRef.current.add(ref);
      await Promise.allSettled(
        pending.flatMap((ref) => [
          ...(ref.storagePath ? [deleteFile(ref.storagePath)] : []),
          ...(ref.driveFileId ? [deleteDriveFile(ref.driveFileId)] : []),
        ])
      );
    },
    []
  );

  const selectedStep = useMemo(
    () => steps.find((s) => s.id === selectedStepId) ?? null,
    [steps, selectedStepId]
  );

  const currentImageSteps = useMemo(
    () => steps.filter((step) => step.imageIndex === currentImageIndex),
    [steps, currentImageIndex]
  );

  return {
    title,
    setTitle,
    description,
    setDescription,
    mode,
    setMode,
    hotspotPulse,
    setHotspotPulse,
    imageTransition,
    setImageTransition,
    welcomeEnabled,
    setWelcomeEnabled,
    welcomeMessage,
    setWelcomeMessage,
    watchPace,
    setWatchPace,
    imageUrls,
    imageKinds,
    videoTrims,
    setVideoTrim,
    currentImageIndex,
    setCurrentImageIndex,
    uploading,
    uploadProgress,
    uploadFromFiles,
    uploadFromClipboard,
    addCapturedMedia,
    deleteImage,
    moveImage,
    reorderImages,
    imageError,
    steps,
    setSteps,
    selectedStepId,
    setSelectedStepId,
    addingStep,
    setAddingStep,
    addStepAt,
    updateStep,
    deleteStep,
    reorderSteps,
    folders,
    folderId,
    onFolderChange,
    selectedStep,
    currentImageSteps,
    canvasMeasurementsRef,
    canvasMeasuredTick,
    notifyCanvasMeasured,
    spotlightRadiiV2,
    markSpotlightRadiiV2,
    undo,
    redo,
    canUndo: !history.gestureBase && history.past.length > 0,
    canRedo: !history.gestureBase && history.future.length > 0,
    beginGesture,
    endGesture,
    queueMediaDeletion,
    flushMediaDeletions,
  };
}
