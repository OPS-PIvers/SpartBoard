import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GuidedLearningSet,
  GuidedLearningMode,
  GuidedLearningStep,
  GuidedLearningSetMetadata,
  GuidedLearningVideoTrim,
  LibraryFolder,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import {
  getMediaKind,
  prepareImageForUpload,
  validateSlideFile,
  videoExtensionForMime,
  type GuidedLearningMediaKind,
} from '@/utils/guidedLearningMedia';

/** State emitted by `onStateChange` so a parent modal can track dirty state. */
export interface GuidedLearningEditorState {
  title: string;
  description: string;
  mode: GuidedLearningMode;
  imageUrls: string[];
  imageKinds: GuidedLearningMediaKind[];
  videoTrims: (GuidedLearningVideoTrim | null)[];
  steps: GuidedLearningStep[];
  uploading: boolean;
  hotspotPulse: 'consistent' | 'reminder' | 'off';
  imageTransition: 'none' | 'slide' | 'fade';
  welcomeEnabled: boolean;
  welcomeMessage: string;
}

/** Live progress for the slide-upload pipeline (null when idle). */
export interface SlideUploadProgress {
  /** 1-based index of the file currently uploading. */
  current: number;
  total: number;
  fileName: string;
  /** 0–100 within the current file; null when the backend can't report. */
  percent: number | null;
}

interface UseGuidedLearningEditorStateProps {
  existingSet: GuidedLearningSet | null;
  existingMeta: GuidedLearningSetMetadata | null;
  onStateChange?: (state: GuidedLearningEditorState) => void;
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

export interface GuidedLearningEditorController {
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
}

/** Normalize a set's persisted kinds array to align with its imageUrls. */
function kindsForSet(set: GuidedLearningSet | null): GuidedLearningMediaKind[] {
  if (!set) return [];
  return set.imageUrls.map((_, i) => set.imageKinds?.[i] ?? 'image');
}

/** Normalize a set's persisted trims array to align with its imageUrls. */
function trimsForSet(
  set: GuidedLearningSet | null
): (GuidedLearningVideoTrim | null)[] {
  if (!set) return [];
  return set.imageUrls.map((_, i) => set.videoTrims?.[i] ?? null);
}

/**
 * Owns all state for the Guided Learning editor. Returned as a controller
 * object that the modal hands to the context + detail pane components.
 */
export function useGuidedLearningEditorState({
  existingSet,
  onStateChange,
  folders,
  folderId,
  onFolderChange,
}: UseGuidedLearningEditorStateProps): GuidedLearningEditorController {
  const { user } = useAuth();
  const { uploading, uploadHotspotImage, uploadGuidedLearningMedia } =
    useStorage();

  const [title, setTitle] = useState(existingSet?.title ?? '');
  const [description, setDescription] = useState(
    existingSet?.description ?? ''
  );
  const [mode, setMode] = useState<GuidedLearningMode>(
    existingSet?.mode ?? 'structured'
  );
  const [imageUrls, setImageUrls] = useState<string[]>(
    existingSet?.imageUrls ?? []
  );
  const [imageKinds, setImageKinds] = useState<GuidedLearningMediaKind[]>(() =>
    kindsForSet(existingSet)
  );
  const [videoTrims, setVideoTrims] = useState<
    (GuidedLearningVideoTrim | null)[]
  >(() => trimsForSet(existingSet));
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [steps, setSteps] = useState<GuidedLearningStep[]>(
    existingSet?.steps ?? []
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [addingStep, setAddingStep] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<SlideUploadProgress | null>(null);
  const [hotspotPulse, setHotspotPulse] = useState<
    'consistent' | 'reminder' | 'off'
  >(existingSet?.hotspotPulse ?? 'consistent');
  const [imageTransition, setImageTransition] = useState<
    'none' | 'slide' | 'fade'
  >(existingSet?.imageTransition ?? 'none');
  const [welcomeEnabled, setWelcomeEnabled] = useState<boolean>(
    Boolean(existingSet?.welcomeEnabled)
  );
  const [welcomeMessage, setWelcomeMessage] = useState<string>(
    existingSet?.welcomeMessage ?? ''
  );

  // Reset all draft state when the underlying set identity changes (parent
  // swapped to a different set). Uses the "adjust state while rendering"
  // pattern so the next render uses fresh values without an extra effect.
  const currentSetId = existingSet?.id ?? null;
  const [prevSetId, setPrevSetId] = useState<string | null>(currentSetId);
  if (currentSetId !== prevSetId) {
    setPrevSetId(currentSetId);
    setTitle(existingSet?.title ?? '');
    setDescription(existingSet?.description ?? '');
    setMode(existingSet?.mode ?? 'structured');
    setImageUrls(existingSet?.imageUrls ?? []);
    setImageKinds(kindsForSet(existingSet));
    setVideoTrims(trimsForSet(existingSet));
    setCurrentImageIndex(0);
    setSteps(existingSet?.steps ?? []);
    setSelectedStepId(null);
    setImageError('');
    setAddingStep(false);
    setUploadProgress(null);
    setHotspotPulse(existingSet?.hotspotPulse ?? 'consistent');
    setImageTransition(existingSet?.imageTransition ?? 'none');
    setWelcomeEnabled(Boolean(existingSet?.welcomeEnabled));
    setWelcomeMessage(existingSet?.welcomeMessage ?? '');
  }

  useEffect(() => {
    onStateChange?.({
      title,
      description,
      mode,
      imageUrls,
      imageKinds,
      videoTrims,
      steps,
      uploading,
      hotspotPulse,
      imageTransition,
      welcomeEnabled,
      welcomeMessage,
    });
  }, [
    title,
    description,
    mode,
    imageUrls,
    imageKinds,
    videoTrims,
    steps,
    uploading,
    hotspotPulse,
    imageTransition,
    welcomeEnabled,
    welcomeMessage,
    onStateChange,
  ]);

  // Render-synced mirror of imageUrls.length so the sequential upload loop
  // (which awaits between appends, letting renders flush) can compute the
  // new last index without putting a side effect inside a state updater.
  const slideCountRef = useRef(imageUrls.length);
  slideCountRef.current = imageUrls.length;

  const appendSlides = useCallback(
    (urls: string[], kinds: GuidedLearningMediaKind[]) => {
      if (urls.length === 0) return;
      setImageUrls((prev) => [...prev, ...urls]);
      setImageKinds((prev) => [...prev, ...kinds]);
      setVideoTrims((prev) => [...prev, ...urls.map(() => null)]);
      // Jump the canvas to the last newly added slide so the teacher can
      // immediately start placing hotspots on it.
      setCurrentImageIndex(slideCountRef.current + urls.length - 1);
    },
    []
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
      setVideoTrims((prev) =>
        prev.map((existing, i) => (i === index ? trim : existing))
      );
    },
    []
  );

  const deleteImage = useCallback(
    (deleteIndex: number) => {
      const updatedImageUrls = imageUrls.filter(
        (_, index) => index !== deleteIndex
      );
      setImageUrls(updatedImageUrls);
      setImageKinds((prev) => prev.filter((_, index) => index !== deleteIndex));
      setVideoTrims((prev) => prev.filter((_, index) => index !== deleteIndex));
      setCurrentImageIndex((curr) => {
        if (updatedImageUrls.length === 0) return 0;
        if (curr === deleteIndex)
          return Math.min(deleteIndex, updatedImageUrls.length - 1);
        if (curr > deleteIndex) return curr - 1;
        return curr;
      });
      setSteps((prev) =>
        prev
          .filter((step) => step.imageIndex !== deleteIndex)
          .map((step) => ({
            ...step,
            imageIndex:
              step.imageIndex > deleteIndex
                ? step.imageIndex - 1
                : step.imageIndex,
          }))
      );
    },
    [imageUrls]
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
      setImageUrls(swap);
      setImageKinds(swap);
      setVideoTrims(swap);
      setSteps((prev) =>
        prev.map((step) => {
          if (step.imageIndex === fromIndex)
            return { ...step, imageIndex: toIndex };
          if (step.imageIndex === toIndex)
            return { ...step, imageIndex: fromIndex };
          return step;
        })
      );
      setCurrentImageIndex((prev) => {
        if (prev === fromIndex) return toIndex;
        if (prev === toIndex) return fromIndex;
        return prev;
      });
    },
    [imageUrls.length]
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
    [currentImageIndex]
  );

  const updateStep = useCallback((updated: GuidedLearningStep) => {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const deleteStep = useCallback(
    (id: string) => {
      setSteps((prev) => prev.filter((s) => s.id !== id));
      if (selectedStepId === id) setSelectedStepId(null);
    },
    [selectedStepId]
  );

  const reorderSteps = useCallback((next: GuidedLearningStep[]) => {
    setSteps(next);
  }, []);

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
  };
}
