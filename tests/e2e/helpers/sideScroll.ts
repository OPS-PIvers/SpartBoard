import { expect, type Locator } from '@playwright/test';

export interface SideScroll {
  scroller: string;
  overflow: number;
}

// Lists every element inside `root` that shows a horizontal scrollbar it never asked for with overflow-x-auto or overflow-auto.
export const measureSideScroll = (root: Locator): Promise<SideScroll[]> =>
  root.evaluate((el) => {
    const optedIn =
      /(^|\s)(overflow-x-(auto|scroll)|overflow-(auto|scroll))(\s|$)/;
    return [el, ...Array.from(el.querySelectorAll('*'))]
      .filter((node): node is HTMLElement => {
        if (!(node instanceof HTMLElement) || node.clientWidth === 0)
          return false;
        const { overflowX } = getComputedStyle(node);
        return (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 1 &&
          !optedIn.test(node.className)
        );
      })
      .map((node) => ({
        scroller: `${node.tagName.toLowerCase()}.${node.className.trim().split(/\s+/).slice(0, 6).join('.')}`,
        overflow: node.scrollWidth - node.clientWidth,
      }));
  });

export const expectNoSideScroll = async (
  root: Locator,
  label: string
): Promise<void> => {
  for (const { scroller, overflow } of await measureSideScroll(root)) {
    expect
      .soft(
        overflow,
        `${label}: ${scroller} scrolls sideways by ${overflow}px. Let its content shrink (min-w-0, flex-wrap), or add overflow-x-auto if sideways scrolling is wanted.`
      )
      .toBe(0);
  }
};
