import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { fileRefsIn, slideMediaRef } from '../utils/slideMedia';
import { narrationDeletionRef } from '../utils/narration';
import {
  getMediaKind,
  prepareImageForUpload,
  slideFileIssue,
  validateSlideFile,
  videoExtensionForMime,
  type GuidedLearningMediaKind,
} from '@/utils/guidedLearningMedia';
import {
  documentFromSet,
  editorHistoryReducer,
  initialHistory,
  isLatestEdit,
  pendingMediaDeletions,
  type EditorDocument,
  type MediaDeletionRef,
} from './editorHistory';
import {
  playOrderInsertIndex,
  remapStepSlides,
  stepsFollowSlide,
} from './studio/timelineOrder';
import {
  readStepClipboard,
  subscribeStepClipboard,
  writeStepClipboard,
} from './studio/stepClipboard';

/** Deletes the files the editor removed, each only if nothing else still uses it. */
export type MediaRelease = (files: {
  storagePaths: string[];
  driveFileIds: string[];
}) => Promise<void>;

/** Live progress for the slide-upload pipeline (null when idle). */
export interface SlideUploadProgress {
  /** 1-based index of the file currently uploading. */
  current: number;
  total: number;
  fileName: string;
  /** 0–100 within the current file; null when the backend can't report. */
  percent: number | null;
}

/** A slide that couldn't be added, as data the Studio translates into a toast. */
export type SlideUploadIssue =
  | { code: 'unsupported'; fileName: string }
  | {
      code: 'tooLarge';
      fileName: string;
      kind: GuidedLearningMediaKind;
      maxMb: number;
    }
  | { code: 'uploadFailed'; fileName: string }
  | { code: 'noClipboardImage' }
  | { code: 'clipboardBlocked' };

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
  /** Studio: new steps go after the slide's last step, and the canvas follows the selected step. */
  setWideTimeline?: boolean;
  /** Called with each batch of slides that couldn't be added. */
  onUploadIssues?: (issues: SlideUploadIssue[]) => void;
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
  /** `tag` marks the edit so `undoIfLatest` can target it. */
  deleteImage: (index: number, tag?: object) => void;
  /** Uploads a redacted copy over a slide and queues the old image for deletion on close. */
  replaceSlideImage: (index: number, blob: Blob) => Promise<boolean>;
  moveImage: (fromIndex: number, direction: -1 | 1) => void;
  /** Reorder slides; `order[i]` is the old index of the slide now at `i`. `moveStepsOf` (an old index) takes that slide's steps along in play order. */
  reorderImages: (order: number[], moveStepsOf?: number) => void;
  /** Whether taking slide `moved` (an old index) along in `order` would change play order. */
  slideMoveReordersSteps: (order: number[], moved: number) => boolean;
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
  deleteStep: (id: string, tag?: object) => void;
  /** Undoes the tagged edit only if nothing was edited or undone since; returns whether it did. */
  undoIfLatest: (tag: object) => boolean;
  /** Copies the step, with a new id, to just after it and selects the copy; one undo entry. */
  duplicateStep: (id: string) => void;
  /** Copies the slide and its steps to just after it, sharing the media file; one undo entry. */
  duplicateSlide: (index: number) => void;
  /** Puts these steps, in play order, on the clipboard shared by every set in this browser session. */
  copySteps: (ids: string[]) => number;
  /** Pastes clipboard steps, with new ids, onto `slide` (default: the current slide); one undo entry. */
  pasteSteps: (slide?: number) => number;
  /** Steps waiting on the clipboard. */
  clipboardStepCount: number;
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
  /** Releases every queued file whose edit is still in effect and the set no longer uses; call after a closing save. */
  flushMediaDeletions: (release: MediaRelease) => Promise<void>;
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
  setWideTimeline = false,
  onUploadIssues,
}: UseGuidedLearningEditorStateProps): GuidedLearningEditorController {
  const { user } = useAuth();
  const onUploadIssuesRef = useRef(onUploadIssues);
  onUploadIssuesRef.current = onUploadIssues;
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
    (
      update: (doc: EditorDocument) => EditorDocument,
      coalesceKey?: string,
      tag?: object
    ) => dispatch({ type: 'apply', update, coalesceKey, at: Date.now(), tag }),
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
  const slideThumbnailsRef = useRef(slideThumbnails);
  slideThumbnailsRef.current = slideThumbnails;
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
      const issues: SlideUploadIssue[] = [];
      const accepted = files.filter((file) => {
        const error = validateSlideFile(file);
        const issue = slideFileIssue(file);
        if (error) errors.push(error);
        if (issue) issues.push({ ...issue, fileName: file.name });
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
            console.error('[GuidedLearningEditor] Slide upload failed:', err);
            issues.push({ code: 'uploadFailed', fileName: file.name });
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
      if (issues.length > 0) onUploadIssuesRef.current?.(issues);
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
      onUploadIssuesRef.current?.([{ code: 'noClipboardImage' }]);
    } catch {
      setImageError(
        'Could not read clipboard. Try Ctrl+V with the editor focused, or use Add media instead.'
      );
      onUploadIssuesRef.current?.([{ code: 'clipboardBlocked' }]);
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
    (deleteIndex: number, tag?: object) => {
      const remaining = imageUrls.length - 1;
      const removedUrl = historyRef.current.present.imageUrls[deleteIndex];
      applyDoc(
        (doc) => ({
          ...doc,
          imageUrls: doc.imageUrls.filter((_, index) => index !== deleteIndex),
          imageKinds: doc.imageKinds.filter(
            (_, index) => index !== deleteIndex
          ),
          videoTrims: doc.videoTrims.filter(
            (_, index) => index !== deleteIndex
          ),
          steps: doc.steps
            .filter((step) => step.imageIndex !== deleteIndex)
            .map((step) =>
              step.imageIndex > deleteIndex
                ? { ...step, imageIndex: step.imageIndex - 1 }
                : step
            ),
        }),
        undefined,
        tag
      );
      // Queued on the delete's history entry, so undo keeps the file until save-and-close.
      for (const url of removedUrl
        ? [removedUrl, slideThumbnails[removedUrl]]
        : []) {
        const ref = url ? slideMediaRef(url) : null;
        if (ref) dispatch({ type: 'queueMedia', ref });
      }
      setCurrentImageIndex((curr) => {
        if (remaining <= 0) return 0;
        if (curr === deleteIndex) return Math.min(deleteIndex, remaining - 1);
        if (curr > deleteIndex) return curr - 1;
        return curr;
      });
    },
    [imageUrls.length, applyDoc, slideThumbnails]
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
      applyDoc((doc) => {
        // A duplicate sharing the old image keeps it.
        const at =
          doc.imageUrls[index] === oldUrl
            ? index
            : doc.imageUrls.indexOf(oldUrl);
        return {
          ...doc,
          imageUrls: doc.imageUrls.map((u, i) => (i === at ? url : u)),
        };
      });
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
    (order: number[], moveStepsOf?: number) => {
      if (order.length !== imageUrls.length) return;
      const newIndexOf = new Map(order.map((oldIndex, i) => [oldIndex, i]));
      const followed =
        moveStepsOf === undefined ? undefined : newIndexOf.get(moveStepsOf);
      applyDoc((doc) => {
        const steps = remapStepSlides(doc.steps, order);
        return {
          ...doc,
          imageUrls: order.map((i) => doc.imageUrls[i]),
          imageKinds: order.map((i) => doc.imageKinds[i]),
          videoTrims: order.map((i) => doc.videoTrims[i] ?? null),
          steps:
            followed === undefined ? steps : stepsFollowSlide(steps, followed),
        };
      });
      setCurrentImageIndex((prev) => newIndexOf.get(prev) ?? prev);
    },
    [imageUrls.length, applyDoc]
  );

  const slideMoveReordersSteps = useCallback(
    (order: number[], moved: number) => {
      const remapped = remapStepSlides(historyRef.current.present.steps, order);
      return stepsFollowSlide(remapped, order.indexOf(moved)) !== remapped;
    },
    []
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
      setSteps((prev) => {
        if (!setWideTimeline) return [...prev, newStep];
        const at = playOrderInsertIndex(prev, currentImageIndex);
        return [...prev.slice(0, at), newStep, ...prev.slice(at)];
      });
      setSelectedStepId(newStep.id);
      setAddingStep(false);
    },
    [currentImageIndex, setSteps, setWideTimeline]
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
    (id: string, tag?: object) => {
      applyDoc(
        (doc) => {
          const next = doc.steps.filter((s) => s.id !== id);
          return next.length === doc.steps.length
            ? doc
            : { ...doc, steps: next };
        },
        undefined,
        tag
      );
      if (selectedStepId === id) setSelectedStepId(null);
    },
    [selectedStepId, applyDoc]
  );

  const reorderSteps = useCallback(
    (next: GuidedLearningStep[]) => setSteps(next),
    [setSteps]
  );

  const duplicateStep = useCallback(
    (id: string) => {
      const source = historyRef.current.present.steps.find((s) => s.id === id);
      if (!source) return;
      const copy: GuidedLearningStep = {
        ...structuredClone(source),
        id: crypto.randomUUID(),
      };
      applyDoc((doc) => {
        const at = doc.steps.findIndex((s) => s.id === id);
        if (at < 0) return doc;
        return {
          ...doc,
          steps: [
            ...doc.steps.slice(0, at + 1),
            copy,
            ...doc.steps.slice(at + 1),
          ],
        };
      });
      setSelectedStepId(copy.id);
    },
    [applyDoc]
  );

  const duplicateSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= historyRef.current.present.imageUrls.length)
        return;
      const at = index + 1;
      const insert = <T>(list: T[], value: T): T[] => [
        ...list.slice(0, at),
        value,
        ...list.slice(at),
      ];
      // Ids are minted outside the reducer so it stays pure.
      const newIds = new Map(
        historyRef.current.present.steps
          .filter((s) => s.imageIndex === index)
          .map((s): [string, string] => [s.id, crypto.randomUUID()])
      );
      applyDoc((doc) => {
        const shifted = doc.steps.map((s) =>
          s.imageIndex > index ? { ...s, imageIndex: s.imageIndex + 1 } : s
        );
        const copies = doc.steps.flatMap((s) => {
          const id = s.imageIndex === index ? newIds.get(s.id) : undefined;
          return id ? [{ ...structuredClone(s), id, imageIndex: at }] : [];
        });
        // The copies play right after the original slide's last step.
        let after = -1;
        shifted.forEach((s, i) => {
          if (s.imageIndex === index) after = i;
        });
        return {
          ...doc,
          imageUrls: insert(doc.imageUrls, doc.imageUrls[index]),
          imageKinds: insert(doc.imageKinds, doc.imageKinds[index] ?? 'image'),
          videoTrims: insert(doc.videoTrims, doc.videoTrims[index] ?? null),
          steps: [
            ...shifted.slice(0, after + 1),
            ...copies,
            ...shifted.slice(after + 1),
          ],
        };
      });
      setSelectedStepId(null);
      setCurrentImageIndex(at);
    },
    [applyDoc]
  );

  // Takes from earlier sessions may be shared by copies or live assignments, so only this session's are ever deleted.
  const sessionTakesRef = useRef<Set<string>>(new Set());

  const copySteps = useCallback((ids: string[]) => {
    const wanted = new Set(ids);
    const picked = historyRef.current.present.steps.filter((s) =>
      wanted.has(s.id)
    );
    if (picked.length === 0) return 0;
    // A copied take may now live in another set, so this session never deletes it.
    for (const s of picked) {
      if (s.narration) sessionTakesRef.current.delete(s.narration.storagePath);
    }
    writeStepClipboard(structuredClone(picked));
    return picked.length;
  }, []);

  const pasteSteps = useCallback(
    (slide?: number) => {
      const copied = readStepClipboard();
      const target = slide ?? currentImageIndex;
      if (
        copied.length === 0 ||
        target < 0 ||
        target >= historyRef.current.present.imageUrls.length
      )
        return 0;
      const pasted = copied.map((s) => ({
        ...structuredClone(s),
        id: crypto.randomUUID(),
        imageIndex: target,
      }));
      setSteps((prev) => {
        if (!setWideTimeline) return [...prev, ...pasted];
        const at = playOrderInsertIndex(prev, target);
        return [...prev.slice(0, at), ...pasted, ...prev.slice(at)];
      });
      setCurrentImageIndex(target);
      setSelectedStepId(pasted[pasted.length - 1].id);
      setAddingStep(false);
      return pasted.length;
    },
    [currentImageIndex, setSteps, setWideTimeline]
  );

  const clipboardStepCount = useSyncExternalStore(
    subscribeStepClipboard,
    () => readStepClipboard().length,
    () => 0
  );

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
  const undoIfLatest = useCallback((tag: object) => {
    if (!isLatestEdit(historyRef.current, tag)) return false;
    dispatch({ type: 'undoIfLatest', tag });
    return true;
  }, []);
  const beginGesture = useCallback(
    () => dispatch({ type: 'beginGesture' }),
    []
  );
  const endGesture = useCallback(() => dispatch({ type: 'endGesture' }), []);
  const queueMediaDeletion = useCallback(
    (ref: MediaDeletionRef) => dispatch({ type: 'queueMedia', ref }),
    []
  );
  const flushMediaDeletions = useCallback(async (release: MediaRelease) => {
    // A file the set still shows (a duplicated slide, a re-added image) is never released.
    const present = historyRef.current.present;
    const inUse = fileRefsIn([
      present.imageUrls,
      present.steps,
      present.imageUrls.map((url) => slideThumbnailsRef.current[url]),
    ]);
    const pending = pendingMediaDeletions(historyRef.current).filter(
      (ref) =>
        !flushedMediaRef.current.has(ref) &&
        !(ref.storagePath && inUse.has(ref.storagePath)) &&
        !(ref.driveFileId && inUse.has(ref.driveFileId))
    );
    for (const ref of pending) flushedMediaRef.current.add(ref);
    const storagePaths = pending.flatMap((ref) =>
      ref.storagePath ? [ref.storagePath] : []
    );
    const driveFileIds = pending.flatMap((ref) =>
      ref.driveFileId ? [ref.driveFileId] : []
    );
    if (storagePaths.length === 0 && driveFileIds.length === 0) return;
    await release({
      storagePaths: [...new Set(storagePaths)],
      driveFileIds: [...new Set(driveFileIds)],
    });
  }, []);

  const selectedStep = useMemo(
    () => steps.find((s) => s.id === selectedStepId) ?? null,
    [steps, selectedStepId]
  );

  // The canvas follows a newly selected step, or one moved to another slide; slide reorders don't count.
  const [followed, setFollowed] = useState<{
    id: string | null;
    imageIndex: number;
    urls: string[];
  }>({ id: null, imageIndex: -1, urls: imageUrls });
  const followId = selectedStep?.id ?? null;
  const followIndex = selectedStep?.imageIndex ?? -1;
  if (
    setWideTimeline &&
    (followId !== followed.id ||
      followIndex !== followed.imageIndex ||
      imageUrls !== followed.urls)
  ) {
    const moved =
      followId !== followed.id ||
      (followIndex !== followed.imageIndex && imageUrls === followed.urls);
    setFollowed({ id: followId, imageIndex: followIndex, urls: imageUrls });
    if (followId && moved && followIndex !== rawImageIndex) {
      setCurrentImageIndex(followIndex);
    }
  }

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
    slideMoveReordersSteps,
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
    duplicateStep,
    duplicateSlide,
    copySteps,
    pasteSteps,
    clipboardStepCount,
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
    undoIfLatest,
    canUndo: !history.gestureBase && history.past.length > 0,
    canRedo: !history.gestureBase && history.future.length > 0,
    beginGesture,
    endGesture,
    queueMediaDeletion,
    flushMediaDeletions,
  };
}
