import type React from 'react';
import type {
  GuidedLearningMode,
  GuidedLearningPublicStep,
  GuidedLearningSet,
  GuidedLearningStep,
} from '@/types';
import type { ImageOffset } from '../utils/imageUtils';

export type StageStep = GuidedLearningStep | GuidedLearningPublicStep;
export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface PctPoint {
  xPct: number;
  yPct: number;
}
/** Container px, top-left origin. */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A step's hit / spotlight / keep-out area in container px (after pan-zoom). */
export interface EffectiveRegion {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 'pin' = no drawn region: the pin button's footprint (today's behaviour). */
  shape: 'pin' | 'rect' | 'ellipse' | 'polygon';
  cornerPx?: number;
  points?: { x: number; y: number }[];
}

export interface StageGeometry {
  containerSize: { w: number; h: number };
  imgOffset: ImageOffset;
  /** Pan-zoom transform currently painted. */
  renderedTransform: { scale: number; tx: number; ty: number };
  imagePctToContainerPx: (p: PctPoint) => { x: number; y: number };
  containerPxToImagePct: (x: number, y: number) => PctPoint;
  /**
   * The only pointer→image conversion anyone may use. Reads the stage image
   * element's getBoundingClientRect, so DeviceFrame scale, Studio canvas zoom
   * and pan-zoom are all accounted for in one place.
   */
  clientToImagePct: (clientX: number, clientY: number) => PctPoint;
  regionFor: (step: StageStep) => EffectiveRegion;
}

export interface GuidedLearningStageProps {
  set: GuidedLearningSet;
  /** Steps as the player narrows them (public shape in student mode). */
  steps: GuidedLearningPublicStep[];
  imageIndex: number;
  /** Step whose overlay is showing; null = none. */
  activeStepId: string | null;
  /** The author's set.mode. Not the learner's Watch/Try choice (that is PlaybackMode). */
  authorMode: GuidedLearningMode;
  answeredStepIds: ReadonlySet<string>;
  teacherMode: boolean;
  /** Persisted v2 zoom level. */
  zoomScale: number;
  /** Studio: render the active step's overlay even when play logic would hide it. */
  forceOverlay?: boolean;
  /** P1-6: step whose callout body renders `renderCalloutEditor` instead of text. */
  editingStepId?: string | null;
  renderCalloutEditor?: (step: StageStep, g: StageGeometry) => React.ReactNode;
  /** Studio edit layer, rendered above overlays with the same geometry. */
  renderEditLayer?: (g: StageGeometry) => React.ReactNode;
  onGeometry?: (g: StageGeometry) => void;
  onPinClick: (stepId: string) => void;
  onAnswer?: (
    stepId: string,
    answer: string | string[],
    isCorrect: boolean | null
  ) => void;
  onAdvance: () => void;
  onDismiss: () => void;
}

// ---- Editor controller additions (P1-3). The existing controller interface is unchanged.
export interface EditorHistoryApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Start a drag/resize; all edits until endGesture form one history entry. */
  beginGesture: () => void;
  endGesture: () => void;
  /** Storage paths / Drive ids to delete after the next successful save on close (P1-9, P2-4). */
  queueMediaDeletion: (ref: {
    storagePath?: string;
    driveFileId?: string;
  }) => void;
}

// ---- Player events (P2-2 emits, P2-5 / P2-3 consume).
export type PlaybackMode = 'watch' | 'try';
export interface StepEvent {
  stepId: string;
  type: 'enter' | 'leave' | 'misclick' | 'hint' | 'complete';
  mode: PlaybackMode | null; // null in explore
  /** ms since the step was entered. */
  ms: number;
  /** Click position in image-%, for misclick/complete. */
  xPct?: number;
  yPct?: number;
}

// ---- Studio frame (P1-4a).
export interface DevicePreset {
  id: 'board' | 'help' | 'chromebook' | 'projector' | 'custom';
  w: number;
  h: number;
  /** Space reserved below the stage (the student app footer). */
  footerPx: number;
}
export interface DeviceFrameContextValue {
  preset: DevicePreset;
  /** Visual scale applied to the true-size frame. */
  k: number;
}
