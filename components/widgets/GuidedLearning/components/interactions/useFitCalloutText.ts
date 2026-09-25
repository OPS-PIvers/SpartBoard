import { type RefObject, useLayoutEffect, useState } from 'react';
import { type CalloutFit, fitCalloutText } from '../../utils/fitCalloutText';

/** CSS variable the card reads its body font size from. */
export const FIT_BODY_VAR = '--gl-fit-body';

/** Fits a callout's text to its box by measuring a hidden clone at the box's pixel width. */
export function useFitCalloutText(
  cardRef: RefObject<HTMLElement | null>,
  box: { w: number; h: number } | undefined,
  contentKey: string,
  paused = false
): CalloutFit | null {
  const [fit, setFit] = useState<CalloutFit | null>(null);
  const w = box?.w ?? 0;
  const h = box?.h ?? 0;

  useLayoutEffect(() => {
    const card = cardRef.current;
    const parent = card?.parentElement;
    if (!card || !parent || w <= 0 || h <= 0 || paused) return;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-gl-callout');
    clone.removeAttribute('data-testid');
    clone.removeAttribute('role');
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      left: '0px',
      top: '0px',
      width: `${w}px`,
      maxWidth: 'none',
      height: 'auto',
      minHeight: '0px',
      maxHeight: 'none',
      animation: 'none',
    });
    parent.appendChild(clone);
    const next = fitCalloutText({
      boxH: h,
      measure: (px) => {
        clone.style.setProperty(FIT_BODY_VAR, `${px}px`);
        return clone.offsetHeight;
      },
    });
    clone.remove();
    setFit((prev) =>
      prev &&
      prev.bodyPx === next.bodyPx &&
      prev.heightPx === next.heightPx &&
      prev.overflow === next.overflow
        ? prev
        : next
    );
  }, [cardRef, w, h, contentKey, paused]);

  return w > 0 && h > 0 ? fit : null;
}
