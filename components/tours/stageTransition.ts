export const STAGE_MOVE_MS = 200;
export const STAGE_STAGGER_MS = 150;
export const STAGE_FADE_MS = 150;
const STAGE_SCALE = 0.12;

export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Start delay for the nth of count widgets; the last one starts STAGE_STAGGER_MS in. */
export const staggerDelay = (index: number, count: number): number =>
  count > 1 ? Math.round((index * STAGE_STAGGER_MS) / (count - 1)) : 0;

/** When the last cleared widget has finished leaving, in ms from the start. */
export const stageClearMs = (count: number, reduced: boolean): number =>
  count === 0
    ? 0
    : reduced
      ? STAGE_FADE_MS
      : STAGE_MOVE_MS + (count > 1 ? STAGE_STAGGER_MS : 0);

/** The transform that tucks a widget into its dock item, or a small shrink with no target. */
export const awayTransform = (
  widget: StageRect,
  target: StageRect | null
): string => {
  if (!target) return 'scale(0.9)';
  const dx = target.left + target.width / 2 - (widget.left + widget.width / 2);
  const dy = target.top + target.height / 2 - (widget.top + widget.height / 2);
  return `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${STAGE_SCALE})`;
};

export const leaveFrames = (away: string, reduced: boolean): Keyframe[] => [
  { opacity: 1, transform: 'none' },
  { opacity: 0, transform: reduced ? 'none' : away },
];

export const returnFrames = (away: string, reduced: boolean): Keyframe[] => [
  { opacity: 0, transform: reduced ? 'none' : away },
  { opacity: 1, transform: 'none' },
];

export const arriveFrames = (reduced: boolean): Keyframe[] => [
  { opacity: 0, transform: reduced ? 'none' : 'scale(0.96)' },
  { opacity: 1, transform: 'none' },
];
