import { expect, type Locator } from '@playwright/test';

// Smallest gap allowed between the last content and the bottom of a scrolled panel.
export const MIN_SCROLL_END_PADDING_PX = 12;
// Short lists and menus are exempt; only panel-sized scrollers are checked.
const MIN_PANEL_HEIGHT_PX = 200;

export interface ScrollEndGap {
  scroller: string;
  lowest: string;
  gap: number;
}

// Scrolls every panel-sized scroller inside `root` to its end and reports how much room is left under the content.
export const measureScrollEndGaps = (root: Locator): Promise<ScrollEndGap[]> =>
  root.evaluate((el, minPanel) => {
    const describe = (node: Element): string => {
      const id = node.id ? `#${node.id}` : '';
      const cls =
        typeof node.className === 'string'
          ? `.${node.className.trim().split(/\s+/).slice(0, 6).join('.')}`
          : '';
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    };
    const scrollers = [el, ...Array.from(el.querySelectorAll('*'))].filter(
      (node): node is HTMLElement => {
        if (!(node instanceof HTMLElement)) return false;
        const { overflowY } = getComputedStyle(node);
        return (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          node.clientHeight >= minPanel &&
          node.scrollHeight > node.clientHeight + 1
        );
      }
    );
    return scrollers.map((scroller) => {
      scroller.scrollTop = scroller.scrollHeight;
      const box = scroller.getBoundingClientRect();
      const innerBottom = box.top + scroller.clientTop + scroller.clientHeight;
      let contentBottom = -Infinity;
      let lowest: Node = scroller;
      const consider = (node: Node, bottom: number) => {
        if (bottom > contentBottom) {
          contentBottom = bottom;
          lowest = node;
        }
      };
      // Nested scrollers clip their own content; count only their box.
      const isClipped = (node: Node): boolean => {
        for (
          let p = node.parentElement;
          p && p !== scroller;
          p = p.parentElement
        ) {
          if (getComputedStyle(p).overflowY !== 'visible') return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(
        scroller,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (isClipped(node)) continue;
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          if (r.height > 0) consider(node, r.bottom);
          continue;
        }
        const child = node as Element;
        const style = getComputedStyle(child);
        if (
          style.position === 'fixed' ||
          style.position === 'absolute' ||
          style.visibility === 'hidden'
        )
          continue;
        const r = child.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Only painted boxes count; a see-through wrapper's padding is empty space.
        const painted =
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          style.backgroundImage !== 'none' ||
          style.boxShadow !== 'none' ||
          parseFloat(style.borderBottomWidth) > 0 ||
          /^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(
            child.tagName
          );
        if (painted) consider(child, r.bottom);
      }
      return {
        scroller: describe(scroller),
        lowest:
          lowest instanceof Element
            ? describe(lowest)
            : `text "${(lowest.textContent ?? '').trim().slice(0, 40)}"`,
        gap: Math.round(innerBottom - contentBottom),
      };
    });
  }, MIN_PANEL_HEIGHT_PX);

export const expectScrollEndPadding = async (
  root: Locator,
  label: string
): Promise<void> => {
  const gaps = await measureScrollEndGaps(root);
  for (const { scroller, lowest, gap } of gaps) {
    expect
      .soft(
        gap,
        `${label}: ${scroller} ends ${gap}px from its bottom edge at ${lowest} (need ${MIN_SCROLL_END_PADDING_PX}px). Put the bottom padding on the scrolling element, or drop h-full from the padded box inside it.`
      )
      .toBeGreaterThanOrEqual(MIN_SCROLL_END_PADDING_PX);
  }
};
