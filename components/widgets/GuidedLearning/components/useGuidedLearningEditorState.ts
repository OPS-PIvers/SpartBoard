import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import {
  GuidedLearningSet,
  GuidedLearningMode,
  GuidedLearningNarration,
  GuidedLearningRegion,
  GuidedLearningStep,
  GuidedLearningSetMetadata,
  GuidedLearningVideoTrim,
  GuidedLearningWatchPace,
  LibraryFolder,
} from '@/types';
import type { EditorHistoryApi } from '../types/stage';
import { useAuth } from '@/context/useAuth';
import {
  useStorage,
  type GuidedLearningImageUpload,
  type GuidedLearningMediaHome,
} from '@/hooks/useStorage';
import {
  isGuidedLearningSetV2,
  stepUsesSpotlight,
} from '../utils/setMigration';
import { slideMediaRef } from '../utils/slideMedia';
import { narrationDeletionRef } from '../utils/narration';
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
  /** Slide URL → 400px thumbnail URL, for slides uploaded to Storage. */
  slideThumbnails: Record<string, string>;
  /** Set/clear the playback-range trim for a video slide. */
  setVideoTrim: (index: number, trim: GuidedLearningVideoTrim | null) => void;
  currentImageIndex: number;
  setCurrentImageIndex: (next: number) => void;
  uploading: boolean;
  uploadProgress: SlideUploadProgress | null;
  uploadFromFiles: (files: File[]) => Promise<void>;
  /** The author closed mid-upload: stop, and delete whatever finishes uploading. */
  abandonUploads: () => void;
  uploadFromClipboard: () => Promise<void>;
  /** Add an editor-captured blob (screen snap / recording) as a new slide. */
  addCapturedMedia: (
    blob: Blob,
    kind: GuidedLearningMediaKind,
    baseName: string
  ) => Promise<void>;
  deleteImage: (index: number) => void;
  /** Uploads a redacted copy over a slide and queues the old image for deletion on close. */
  replaceSlideImage: (index: number, blob: Blob) => Promise<boolean>;
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
  /** Adds a step at a point, or with a drawn region centred there, and selects it. */
  addStepAt: (
    xPct: number,
    yPct: number,
    region?: GuidedLearningRegion
  ) => void;
  updateStep: (updated: GuidedLearningStep) => void;
  deleteStep: (id: string) => void;
  /** Apply a new ordering of the entire steps array (e.g. from drag-reorder). */
  reorderSteps: (next: GuidedLearningStep[]) => void;
  /** Uploads a recorded narration take for this editing session. */
  uploadNarrationTake: (
    blob: Blob,
    mimeType: string
  ) => Promise<{ url: string; storagePath: string }>;
  /** Sets or clears a step's narration; a take recorded this session is queued for deletion when replaced. */
  setStepNarration: (
    stepId: string,
    next: GuidedLearningNarration | undefined
  ) => void;
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
  markSpotlightRadiiV2: (
    convert: (steps: GuidedLearningStep[]) => GuidedLearningStep[] | null
  ) => void;
  /** Deletes every queued file whose edit is still in effect; call after a closing save. */
  flushMediaDeletions: (
    deleteFile: (storagePath: string) => Promise<void>,
    deleteDriveFile: (fileId: string) => Promise<void>
  ) => Promise<void>;
}

// A set with no spotlight has no radius to convert, so it needs no load-time measuring.
const startsOnV2Radii = (set: GuidedLearningSet | null) =>
  !set || isGuidedLearningSetV2(set) || !set.steps.some(stepUsesSpotlight);

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
  const {
    uploading,
    uploadGuidedLearningMedia,
    uploadGuidedLearningImage,
    deleteFile: deleteStorageFile,
    deleteDriveFile: deleteDriveSlide,
  } = useStorage();

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
    startsOnV2Radii(existingSet)
  );
  // Outside undo history: an undone slide keeps its entry, and saves drop entries for absent slides.
  const [slideThumbnails, setSlideThumbnails] = useState<
    Record<string, string>
  >(() => existingSet?.slideThumbnails ?? {});
  const mediaHome: GuidedLearningMediaHome =
    existingSet?.isBuilding || existingSet?.helpCenter ? 'storage' : 'drive';

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
    setSpotlightRadiiV2(startsOnV2Radii(existingSet));
    setSlideThumbnails(existingSet?.slideThumbnails ?? {});
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

  const abandonedRef = useRef(false);
  const abandonUploads = useCallback(() => {
    abandonedRef.current = true;
  }, []);
  // True when the upload landed after the author closed; its file is deleted.
  const discardIfAbandoned = useCallback(
    (url: string): boolean => {
      if (!abandonedRef.current) return false;
      const ref = slideMediaRef(url);
      const deletion = !ref
        ? null
        : 'storagePath' in ref
          ? deleteStorageFile(ref.storagePath)
          : deleteDriveSlide(ref.driveFileId);
      void deletion?.catch(() => undefined);
      return true;
    },
    [deleteStorageFile, deleteDriveSlide]
  );

  // Prepared (WebP, 2560 cap) and sent to this set's media home; null when it landed after close.
  const uploadSlideImage = useCallback(
    async (uid: string, file: File): Promise<string | null> => {
      const prepared = await prepareImageForUpload(file);
      const upload: GuidedLearningImageUpload = await uploadGuidedLearningImage(
        uid,
        prepared,
        prepared.name.replace(/[^\w.-]+/g, '_'),
        mediaHome
      );
      const { url, thumbnailUrl: thumb } = upload;
      if (discardIfAbandoned(url)) {
        if (thumb) discardIfAbandoned(thumb);
        return null;
      }
      if (thumb) setSlideThumbnails((prev) => ({ ...prev, [url]: thumb }));
      return url;
    },
    [uploadGuidedLearningImage, mediaHome, discardIfAbandoned]
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
          if (abandonedRef.current) break;
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
              if (!discardIfAbandoned(url)) appendSlides([url], ['video']);
            } else {
              const url = await uploadSlideImage(user.uid, file);
              if (url) appendSlides([url], ['image']);
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
    [
      user,
      uploadSlideImage,
      uploadGuidedLearningMedia,
      appendSlides,
      discardIfAbandoned,
    ]
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

  const replaceSlideImage = useCallback(
    async (index: number, blob: Blob): Promise<boolean> => {
      const oldUrl = historyRef.current.present.imageUrls[index];
      if (!user || !oldUrl) return false;
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      const url = await uploadSlideImage(
        user.uid,
        new File([blob], `redacted.${ext}`, { type: blob.type || 'image/png' })
      );
      if (!url) return false;
      // Slides may have moved during the upload, so find the old image again.
      if (!historyRef.current.present.imageUrls.includes(oldUrl)) return false;
      applyDoc((doc) => ({
        ...doc,
        imageUrls: doc.imageUrls.map((u) => (u === oldUrl ? url : u)),
      }));
      const ref = slideMediaRef(oldUrl);
      if (ref) dispatch({ type: 'queueMedia', ref });
      return true;
    },
    [user, uploadSlideImage, applyDoc]
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
    (xPct: number, yPct: number, region?: GuidedLearningRegion) => {
      const newStep: GuidedLearningStep = {
        id: crypto.randomUUID(),
        xPct,
        yPct,
        imageIndex: currentImageIndex,
        interactionType: 'text-popover',
        showOverlay: 'none',
        text: '',
        ...(region ? { region } : {}),
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

  // Takes from earlier sessions may be shared by copies or live assignments, so only this session's are ever deleted.
  const sessionTakesRef = useRef<Set<string>>(new Set());
  const uploadNarrationTake = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!user) throw new Error('Not signed in');
      const ext = mimeType.includes('mp4')
        ? 'm4a'
        : mimeType.includes('ogg')
          ? 'ogg'
          : 'webm';
      const { url, storagePath } = await uploadGuidedLearningMedia(
        user.uid,
        blob,
        `narration.${ext}`
      );
      sessionTakesRef.current.add(storagePath);
      return { url, storagePath };
    },
    [user, uploadGuidedLearningMedia]
  );

  const setStepNarration = useCallback(
    (stepId: string, next: GuidedLearningNarration | undefined) => {
      const prev = historyRef.current.present.steps.find(
        (s) => s.id === stepId
      )?.narration;
      applyDoc((doc) => ({
        ...doc,
        steps: doc.steps.map((s) => {
          if (s.id !== stepId) return s;
          if (next) return { ...s, narration: next };
          const { narration: _removed, ...rest } = s;
          return rest;
        }),
      }));
      const ref = narrationDeletionRef(prev);
      if (
        ref &&
        ref.storagePath !== next?.storagePath &&
        sessionTakesRef.current.has(ref.storagePath)
      )
        dispatch({ type: 'queueMedia', ref });
    },
    [applyDoc]
  );

  const canvasMeasurementsRef = useRef<GuidedLearningCanvasMeasurements | null>(
    null
  );

  const notifyCanvasMeasured = useCallback(
    () => setCanvasMeasuredTick((t) => t + 1),
    []
  );

  // The load-time radius conversion rewrites history too, so undo never restores legacy radii under v2 semantics.
  const markSpotlightRadiiV2 = useCallback(
    (convert: (steps: GuidedLearningStep[]) => GuidedLearningStep[] | null) => {
      setSpotlightRadiiV2(true);
      dispatch({
        type: 'rebase',
        convert: (doc) => {
          const steps = convert(doc.steps);
          return steps ? { ...doc, steps } : null;
        },
      });
    },
    []
  );

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
    slideThumbnails,
    setVideoTrim,
    currentImageIndex,
    setCurrentImageIndex,
    uploading,
    uploadProgress,
    uploadFromFiles,
    abandonUploads,
    uploadFromClipboard,
    addCapturedMedia,
    deleteImage,
    replaceSlideImage,
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
    uploadNarrationTake,
    setStepNarration,
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
