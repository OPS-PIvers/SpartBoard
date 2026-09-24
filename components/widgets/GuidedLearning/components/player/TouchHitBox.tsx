import React from 'react';

/** Smallest touch target, in px. */
export const TOUCH_TARGET_PX = 44;

interface Props {
  /** Width override, e.g. to stop neighbouring hit boxes overlapping. */
  width?: string;
  round?: boolean;
}

/** A transparent box that grows its (relative) parent's hit area to 44px. */
export const TouchHitBox: React.FC<Props> = ({ width, round = false }) => (
  <span
    aria-hidden="true"
    data-gl-hitbox=""
    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-transparent ${
      round ? 'rounded-full' : ''
    }`}
    style={{
      width: width ?? '100%',
      minWidth: width ? undefined : TOUCH_TARGET_PX,
      height: '100%',
      minHeight: TOUCH_TARGET_PX,
    }}
  />
);
