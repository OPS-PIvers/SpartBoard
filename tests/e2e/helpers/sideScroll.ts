import { expect, type Locator } from '@playwright/test';

export interface SideScroll {
  scroller: string;
  problem: 'scrollbar' | 'clipped';
  overflow: number;
}

// Finds stray sideways scrollbars, and content cut off by a vertical scroller's clipped sides, inside `root`.
export const measureSideScroll = (root: Locator): Promise<SideScroll[]> =>
  root.evaluate((el) => {
    const optedIn =
      /(^|\s)([\w-]+:)*(overflow-x-(auto|scroll)|overflow-(auto|scroll)|\[overflow-x:(auto|scroll)\])(\s|$)/;
    const describe = (node: HTMLElement) =>
      `${node.tagName.toLowerCase()}.${node.className.trim().split(/\s+/).slice(0, 6).join('.')}`;
    const found: SideScroll[] = [];
    for (const node of [el, ...Array.from(el.querySelectorAll('*'))]) {
      if (!(node instanceof HTMLElement) || node.clientWidth === 0) continue;
      const { overflowX, overflowY } = getComputedStyle(node);
      const scrollsY = overflowY === 'auto' || overflowY === 'scroll';
      const right =
        node.getBoundingClientRect().left + node.clientLeft + node.clientWidth;
      if (
        (overflowX === 'auto' || overflowX === 'scroll') &&
        node.scrollWidth > node.clientWidth + 1 &&
        !optedIn.test(node.className)
      ) {
        found.push({
          scroller: describe(node),
          problem: 'scrollbar',
          overflow: node.scrollWidth - node.clientWidth,
        });
      } else if (overflowX === 'hidden' && scrollsY) {
        // Pseudo-element tap areas are fine to clip; a real box past the edge is lost content.
        let worst = 0;
        for (const child of Array.from(node.querySelectorAll('*'))) {
          const box = child.getBoundingClientRect();
          if (box.width === 0 || getComputedStyle(child).position === 'fixed')
            continue;
          // A box inside an inner scroller or clip is that box's business.
          let inner = false;
          for (
            let p = child.parentElement;
            p && p !== node;
            p = p.parentElement
          )
            if (getComputedStyle(p).overflowX !== 'visible') inner = true;
          if (inner) continue;
          worst = Math.max(worst, box.right - right);
        }
        if (worst > 1)
          found.push({
            scroller: describe(node),
            problem: 'clipped',
            overflow: Math.round(worst),
          });
      }
    }
    return found;
  });

export const expectNoSideScroll = async (
  root: Locator,
  label: string
): Promise<void> => {
  for (const { scroller, problem, overflow } of await measureSideScroll(root)) {
    expect
      .soft(
        overflow,
        problem === 'scrollbar'
          ? `${label}: ${scroller} scrolls sideways by ${overflow}px. Let its content shrink (min-w-0, flex-wrap), or add overflow-x-auto if sideways scrolling is wanted.`
          : `${label}: ${scroller} cuts off ${overflow}px of content on its right. Let the row shrink (min-w-0, flex-wrap).`
      )
      .toBe(0);
  }
};
