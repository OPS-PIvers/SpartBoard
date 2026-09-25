/** Stage elements that follow a Studio gesture before the document is written. */
export interface GesturePreview {
  /** Moves the followed elements by container px (the CSS `translate` property). */
  shift: (dx: number, dy: number) => void;
  /** Redraws the spotlight hole and rim of a drawn region. */
  shape: (d: string) => void;
  /** Puts every element back exactly as React left it. */
  restore: () => void;
}

interface PreviewOptions {
  /** `card` moves the callout card alone; `overlay` moves what is placed off the target (tooltip, spotlight label). */
  callout: 'card' | 'overlay' | null;
  /** The spotlight hole and rim move with the step. */
  spot: boolean;
}

const byAttr = (root: Element, attr: string, id: string): Element[] =>
  [...root.querySelectorAll(`[${attr}]`)].filter(
    (el) => el.getAttribute(attr) === id
  );

type Styled = Element & { style: CSSStyleDeclaration };

/** Collects the stage elements a gesture on `stepId` previews, keeping their original values. */
export function createGesturePreview(
  stage: Element | null | undefined,
  stepId: string,
  { callout, spot }: PreviewOptions
): GesturePreview {
  const shifted: Styled[] = [];
  const shapes: Element[] = [];
  if (stage) {
    // Only callouts placed off the target follow it; a popover card stays where placement puts it.
    if (callout === 'overlay') {
      shifted.push(...(byAttr(stage, 'data-gl-overlay', stepId) as Styled[]));
    } else if (callout === 'card') {
      shifted.push(...(byAttr(stage, 'data-gl-callout', stepId) as Styled[]));
    }
    if (spot) {
      const spots = byAttr(stage, 'data-gl-spot', stepId);
      shifted.push(...(spots as Styled[]));
      shapes.push(...spots.filter((el) => el.tagName.toLowerCase() === 'path'));
    }
  }
  const translates = shifted.map((el) => el.style.translate);
  const paths = shapes.map((el) => el.getAttribute('d'));
  return {
    shift: (dx, dy) => {
      const value = dx === 0 && dy === 0 ? '' : `${dx}px ${dy}px`;
      shifted.forEach((el) => (el.style.translate = value));
    },
    shape: (d) => shapes.forEach((el) => el.setAttribute('d', d)),
    restore: () => {
      shifted.forEach((el, i) => (el.style.translate = translates[i]));
      shapes.forEach((el, i) => {
        const d = paths[i];
        if (d === null) el.removeAttribute('d');
        else el.setAttribute('d', d);
      });
    },
  };
}
