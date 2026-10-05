// Raw geometry the in-page collector returns for one rendered widget; analyzers turn it into measurements.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a control's centre resolved under elementsFromPoint. */
export type CenterHit =
  | 'self'
  | 'covered'
  | 'clipped'
  | 'scrolled'
  | 'offscreen';

export interface ControlInfo {
  path: string;
  label: string;
  box: Box;
  /** Box after clipping by every overflow ancestor up to the card; null when nothing shows. */
  visibleBox: Box | null;
  /** Box after clipping by non-scrolling ancestors only; null when they hide it entirely. */
  nonScrollBox: Box | null;
  clippedByNonScroller: boolean;
  hiddenInScroller: boolean;
  centerHit: CenterHit;
  coveredBy: string | null;
  /** Visually hidden (sr-only) controls are measured through their label, if any. */
  srOnly: boolean;
  /** Rendered but at opacity ~0, e.g. revealed on hover. */
  transparent: boolean;
  /** Nested inside another control in this list. */
  nested: boolean;
}

export interface BackgroundLayer {
  color: string;
  /** Computed background-image when it is not `none`. */
  image: string | null;
}

export interface TextInfo {
  path: string;
  text: string;
  box: Box;
  fontPx: number;
  fontWeight: number;
  nonScrollBox: Box | null;
  clippedByNonScroller: boolean;
  hiddenInScroller: boolean;
  /** Clipped by an ancestor that truncates on purpose (ellipsis or line clamp). */
  truncated: boolean;
  /** CSS overflow on the text's own element: content wider or taller than a non-scrolling box. */
  overflowsOwnBox: boolean;
  color: string;
  /** Background layers from the text's element outward to the document, innermost first. */
  layers: BackgroundLayer[];
}

export interface MediaInfo {
  path: string;
  box: Box;
  nonScrollBox: Box | null;
  clippedByNonScroller: boolean;
  clippedFraction: number;
}

export interface ScrollerInfo {
  path: string;
  box: Box;
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  /** Another actively scrolling element contains this one. */
  nested: boolean;
}

export interface StripInfo {
  side: string;
  samples: number;
  covered: number;
}

export interface FaceSnapshot {
  card: Box;
  viewport: { w: number; h: number };
  controls: ControlInfo[];
  texts: TextInfo[];
  media: MediaInfo[];
  scrollers: ScrollerInfo[];
  /** Union of everything visible on the face, clipped to the card; null for a blank face. */
  contentBox: Box | null;
  drag: { samples: number; draggable: number };
  strips: StripInfo[];
  toolbar: Box | null;
  faceText: string;
}

export interface CollectOptions {
  widgetId: string;
  dragBlockingSelector: string;
  interactiveSelector: string;
  controlSelector: string;
  gridCols: number;
  gridRows: number;
}
