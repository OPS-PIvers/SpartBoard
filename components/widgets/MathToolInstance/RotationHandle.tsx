import React, { useCallback, useRef, useState } from 'react';

interface RotationHandleProps {
  rotation: number;
  onRotate: (newRotation: number) => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function snapToNearest45(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  let closest = SNAP_ANGLES[0];
  let minDiff = Infinity;
  for (const snap of SNAP_ANGLES) {
    const diff = Math.abs(normalized - snap);
    const wrapped = Math.min(diff, 360 - diff);
    if (wrapped < minDiff) {
      minDiff = wrapped;
      closest = snap;
    }
  }
  return closest;
}

function getAngleFromCenter(
  clientX: number,
  clientY: number,
  rect: DOMRect
): number {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radians = Math.atan2(clientY - centerY, clientX - centerX);
  return ((radians * 180) / Math.PI + 360) % 360;
}

/** Normalize an angle delta to the [-180, 180] range to prevent jumps at
 *  the 0°/360° boundary during drag. */
function wrapDelta(delta: number): number {
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

const DRAG_THRESHOLD_PX = 4;

export const RotationHandle: React.FC<RotationHandleProps> = ({
  rotation,
  onRotate,
  containerRef,
}) => {
  const isDragging = useRef(false);
  const startAngle = useRef(0);
  const startRotation = useRef(0);
  const hasDragged = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Do NOT stopPropagation — let DraggableWindow receive the event so the
      // widget is focused / brought to front as expected.
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      startAngle.current = getAngleFromCenter(e.clientX, e.clientY, rect);
      startRotation.current = rotation;
      startPos.current = { x: e.clientX, y: e.clientY };
      hasDragged.current = false;
      isDragging.current = true;
      setIsActive(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [rotation, containerRef]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDragging.current || !containerRef.current) return;

      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (!hasDragged.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      hasDragged.current = true;
      const rect = containerRef.current.getBoundingClientRect();
      const currentAngle = getAngleFromCenter(e.clientX, e.clientY, rect);
      // Wrap delta to [-180, 180] to avoid jumps when crossing 0°/360°
      const delta = wrapDelta(currentAngle - startAngle.current);
      const newRotation = (((startRotation.current + delta) % 360) + 360) % 360;
      onRotate(Math.round(newRotation));
    },
    [containerRef, onRotate]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setIsActive(false);

      // Guard before releasing — can throw if capture was already lost (pointercancel)
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }

      // If no meaningful drag occurred, snap to nearest 45°
      if (!hasDragged.current) {
        onRotate(snapToNearest45(rotation));
      }
    },
    [onRotate, rotation]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRotate(0);
    },
    [onRotate]
  );

  const displayRotation = Math.round(((rotation % 360) + 360) % 360);

  return (
    <div
      className={`absolute z-dropdown pointer-events-none transition-opacity ${
        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      style={{ right: '-14px', bottom: '-14px' }}
    >
      {/* Degree badge */}
      <div
        className="absolute pointer-events-none"
        style={{ right: '22px', bottom: '2px', whiteSpace: 'nowrap' }}
      >
        <span
          className="bg-indigo-600 text-white font-black rounded px-1 py-0.5 shadow"
          style={{ fontSize: 'min(9px, 3cqmin)' }}
        >
          {displayRotation}°
        </span>
      </div>

      {/* Circular grip — <button> for keyboard focus and accessibility */}
      <button
        type="button"
        className="pointer-events-auto rounded-full bg-white border-2 border-indigo-500 shadow-md flex items-center justify-center select-none"
        style={{
          cursor: isActive ? 'grabbing' : 'grab',
          width: 'clamp(16px, 5cqmin, 20px)',
          height: 'clamp(16px, 5cqmin, 20px)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        aria-label="Rotate math tool"
        title="Drag to rotate · Click to snap 45° · Double-click to reset"
      >
        {/* Arrow indicator */}
        <svg
          viewBox="0 0 10 10"
          fill="none"
          className="text-indigo-500"
          style={{
            width: 'min(10px, 2.5cqmin)',
            height: 'min(10px, 2.5cqmin)',
          }}
        >
          <path
            d="M5 1.5 A3.5 3.5 0 1 1 1.5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M1.5 2.5 L1.5 5 L4 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
};
