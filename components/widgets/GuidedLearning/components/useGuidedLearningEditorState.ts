import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GuidedLearningSet,
  GuidedLearningMode,
  GuidedLearningStep,
  GuidedLearningSetMetadata,
  LibraryFolder,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';

/** State emitted by `onStateChange` so a parent modal can track dirty state. */
export interface GuidedLearningEditorState {
  title: string;
  description: string;
  mode: GuidedLearningMode;
  imageUrls: string[];
  steps: GuidedLearningStep[];
  uploading: boolean;
  hotspotPulse: 'consistent' | 'reminder' | 'off';
  imageTransition: 'none' | 'slide' | 'fade';
  welcomeEnabled: boolean;
  welcomeMessage: string;
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
  // Images
  imageUrls: string[];
  currentImageIndex: number;
  setCurrentImageIndex: (next: number) => void;
  uploading: boolean;
  uploadFromFiles: (files: File[]) => Promise<void>;
  uploadFromClipboard: () => Promise<void>;
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
  const { uploading, uploadHotspotImage } = useStorage();

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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [steps, setSteps] = useState<GuidedLearningStep[]>(
    existingSet?.steps ?? []
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [addingStep, setAddingStep] = useState(false);
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
    setCurrentImageIndex(0);
    setSteps(existingSet?.steps ?? []);
    setSelectedStepId(null);
    setImageError('');
    setAddingStep(false);
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
    steps,
    uploading,
    hotspotPulse,
    imageTransition,
    welcomeEnabled,
    welcomeMessage,
    onStateChange,
  ]);

  const uploadFromFiles = useCallback(
    async (files: File[]) => {
      if (!user || files.length === 0) return;
      setImageError('');
      try {
        const uploadedUrls = await Promise.all(
          files.map((file) => uploadHotspotImage(user.uid, file))
        );
        if (uploadedUrls.length > 0) {
          setImageUrls((prev) => [...prev, ...uploadedUrls]);
          setCurrentImageIndex((prev) =>
            Math.max(prev, imageUrls.length + uploadedUrls.length - 1)
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setImageError(msg);
      }
    },
    [user, uploadHotspotImage, imageUrls.length]
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
        'Could not read clipboard. Try using the file upload instead.'
      );
    }
  }, [uploadFromFiles]);

  const deleteImage = useCallback(
    (deleteIndex: number) => {
      const updatedImageUrls = imageUrls.filter(
        (_, index) => index !== deleteIndex
      );
      setImageUrls(updatedImageUrls);
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
      setImageUrls((prev) => {
        const updated = [...prev];
        [updated[fromIndex], updated[toIndex]] = [
          updated[toIndex],
          updated[fromIndex],
        ];
        return updated;
      });
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
    currentImageIndex,
    setCurrentImageIndex,
    uploading,
    uploadFromFiles,
    uploadFromClipboard,
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
