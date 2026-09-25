import { calloutArrowPaths } from '../interactions/CalloutArrow';
import { connectorFor } from '../../utils/calloutPlacement';
import type { PxRect } from '../../types/stage';

/** Stage elements that follow a Studio gesture before the document is written. */
export interface GesturePreview {
  /** Moves the followed elements by container px (the CSS `translate` property). */
  shift: (dx: number, dy: number) => void;
  /** Resizes the callout card, in container px. */
  size: (w: number, h: number) => void;
  /** Redraws the spotlight hole and rim of a drawn region. */
  shape: (d: string) => void;
  /** Moves the anchor dot by container px when the callout stays put. */
  anchor: (dx: number, dy: number) => void;
  /** Redraws the connector from a callout box to its target, hiding it when the box covers the target. */
  route: (box: PxRect, target: PxRect) => void;
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
  const cards: Styled[] = [];
  const shapes: Element[] = [];
  const anchors: Styled[] = [];
  const connectors: Styled[] = [];
  if (stage) {
    // Inside a moving overlay the connector and anchor already travel with it.
    if (callout !== 'overlay') {
      anchors.push(...(byAttr(stage, 'data-gl-anchor', stepId) as Styled[]));
      connectors.push(
        ...(byAttr(stage, 'data-gl-connector', stepId) as Styled[])
      );
    }
    // Only callouts placed off the target follow it; a popover card stays where placement puts it.
    if (callout === 'overlay') {
      shifted.push(...(byAttr(stage, 'data-gl-overlay', stepId) as Styled[]));
    } else if (callout === 'card') {
      cards.push(...(byAttr(stage, 'data-gl-callout', stepId) as Styled[]));
      shifted.push(...cards);
    }
    if (spot) {
      const spots = byAttr(stage, 'data-gl-spot', stepId);
      shifted.push(...(spots as Styled[]));
      shapes.push(...spots.filter((el) => el.tagName.toLowerCase() === 'path'));
    }
  }
  const translates = shifted.map((el) => el.style.translate);
  const sizes = cards.map((el) => ({
    width: el.style.width,
    minHeight: el.style.minHeight,
    maxWidth: el.style.maxWidth,
  }));
  const paths = shapes.map((el) => el.getAttribute('d'));
  const anchorTranslates = anchors.map((el) => el.style.translate);
  const lines = connectors.flatMap((svg) => [
    ...svg.querySelectorAll('[data-gl-connector-line]'),
  ]);
  const heads = connectors.flatMap((svg) => [
    ...svg.querySelectorAll('[data-gl-connector-head]'),
  ]);
  const lineDs = lines.map((el) => el.getAttribute('d'));
  const headPoints = heads.map((el) => el.getAttribute('points'));
  const displays = connectors.map((el) => el.style.display);
  const setAttr = (el: Element, name: string, value: string | null) => {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  };
  return {
    shift: (dx, dy) => {
      const value = dx === 0 && dy === 0 ? '' : `${dx}px ${dy}px`;
      shifted.forEach((el) => (el.style.translate = value));
    },
    size: (w, h) =>
      cards.forEach((el) => {
        el.setAttribute('data-gl-previewing', '');
        el.style.width = `${w}px`;
        el.style.minHeight = `${h}px`;
        el.style.maxWidth = 'none';
      }),
    shape: (d) => shapes.forEach((el) => el.setAttribute('d', d)),
    anchor: (dx, dy) => {
      const value = dx === 0 && dy === 0 ? '' : `${dx}px ${dy}px`;
      anchors.forEach((el) => (el.style.translate = value));
    },
    route: (box, target) => {
      const arrow = connectorFor(box, target);
      const p = arrow && calloutArrowPaths(arrow.from, arrow.to, arrow.normal);
      connectors.forEach((el) => (el.style.display = p ? '' : 'none'));
      if (!p) return;
      lines.forEach((el) => el.setAttribute('d', p.d));
      heads.forEach((el) => el.setAttribute('points', p.head));
    },
    restore: () => {
      anchors.forEach((el, i) => (el.style.translate = anchorTranslates[i]));
      connectors.forEach((el, i) => (el.style.display = displays[i]));
      lines.forEach((el, i) => setAttr(el, 'd', lineDs[i]));
      heads.forEach((el, i) => setAttr(el, 'points', headPoints[i]));
      shifted.forEach((el, i) => (el.style.translate = translates[i]));
      cards.forEach((el, i) => {
        Object.assign(el.style, sizes[i]);
        el.removeAttribute('data-gl-previewing');
      });
      shapes.forEach((el, i) => setAttr(el, 'd', paths[i]));
    },
  };
}
