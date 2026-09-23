import { vi } from 'vitest';

export interface StageLayoutOptions {
  container: { w: number; h: number };
  image: { w: number; h: number };
  /** Page offset of the stage container, to prove client→image maths subtracts it. */
  origin?: { x: number; y: number };
  /** Custom rect for other elements (e.g. callouts); null falls back to the container. */
  rectFor?: (el: Element) => DOMRect | null;
}

export interface StageLayoutHandle {
  /** Fire every observed ResizeObserver with the current container size. */
  fireResize: () => void;
  /** Change the container size and fire the observers. */
  resize: (container: { w: number; h: number }) => void;
  restore: () => void;
}

type Observed = { cb: ResizeObserverCallback; ro: ResizeObserver; el: Element };

export const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({
    x,
    y,
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  }) as DOMRect;

/** Reads `scale(s) translate(xpx, ypx)` from the pan-zoom layer, if any. */
function panZoomOf(el: Element): { s: number; x: number; y: number } {
  const layer = el.closest('[data-testid="gl-panzoom-layer"]');
  const transform = layer instanceof HTMLElement ? layer.style.transform : '';
  const m =
    /scale\(([-\d.e]+)\)\s*translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(
      transform
    );
  if (!m) return { s: 1, x: 0, y: 0 };
  return { s: Number(m[1]), x: Number(m[2]), y: Number(m[3]) };
}

/**
 * Stubs layout for a GuidedLearningStage in jsdom: container and media rects
 * (media rects follow the painted pan-zoom), image natural size, and a
 * ResizeObserver that can be fired on demand.
 */
export function mockStageLayout(opts: StageLayoutOptions): StageLayoutHandle {
  let container = opts.container;
  const origin = opts.origin ?? { x: 0, y: 0 };
  const observed: Observed[] = [];

  class ResizeObserverMock {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      observed.push({
        cb: this.cb,
        ro: this as unknown as ResizeObserver,
        el,
      });
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      for (let i = observed.length - 1; i >= 0; i--) {
        if (observed[i].ro === (this as unknown as ResizeObserver)) {
          observed.splice(i, 1);
        }
      }
    }
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);

  const rectSpy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element) {
      if (
        this instanceof HTMLImageElement ||
        this instanceof HTMLVideoElement
      ) {
        const { s, x, y } = panZoomOf(this);
        return rect(
          origin.x + s * x,
          origin.y + s * y,
          container.w * s,
          container.h * s
        );
      }
      return (
        opts.rectFor?.(this) ??
        rect(origin.x, origin.y, container.w, container.h)
      );
    });
  const widthSpy = vi
    .spyOn(Element.prototype, 'clientWidth', 'get')
    .mockImplementation(() => container.w);
  const heightSpy = vi
    .spyOn(Element.prototype, 'clientHeight', 'get')
    .mockImplementation(() => container.h);
  const naturalW = vi
    .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
    .mockImplementation(() => opts.image.w);
  const naturalH = vi
    .spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get')
    .mockImplementation(() => opts.image.h);

  const fireResize = () => {
    for (const { cb, ro, el } of [...observed]) {
      cb(
        [
          {
            target: el,
            contentRect: rect(0, 0, container.w, container.h),
          } as ResizeObserverEntry,
        ],
        ro
      );
    }
  };

  return {
    fireResize,
    resize: (next) => {
      container = next;
      fireResize();
    },
    restore: () => {
      rectSpy.mockRestore();
      widthSpy.mockRestore();
      heightSpy.mockRestore();
      naturalW.mockRestore();
      naturalH.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}
