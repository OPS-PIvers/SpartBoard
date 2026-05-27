import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { PageEditor } from './PageEditor';

// jsdom does not implement SVGGraphicsElement.getBBox or DOMMatrix; stub them
// just enough to avoid render-time throws from the editor's geometry helpers.
// The bug under test is in the pointer-up branch and does not depend on real
// geometry. Done at module load so the stubs are in place before any
// `render()` triggers an effect that calls into them.
const svgProto = SVGElement.prototype as unknown as {
  getBBox: () => DOMRect;
  getScreenCTM: () => null;
  getCTM: () => null;
};
svgProto.getBBox = () => new DOMRect(0, 0, 0, 0);
svgProto.getScreenCTM = () => null;
svgProto.getCTM = () => null;
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix !== 'function') {
  class StubMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    translateSelf() {
      return this;
    }
    scaleSelf() {
      return this;
    }
    multiply() {
      return this;
    }
    inverse() {
      return this;
    }
  }
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = StubMatrix;
}

const TEST_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <g class="foreground">
    <rect x="100" y="100" width="200" height="150" fill="#3b82f6"/>
  </g>
</svg>`;

const fire = (target: Element, type: string, props: PointerEventInit): void => {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, ...props }));
};

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('PageEditor — pointerup robustness', () => {
  // Hold the original behind a wrapper so the lint rule against unbound
  // method references doesn't fire on the restore line.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalRelease = Element.prototype.releasePointerCapture;

  afterEach(() => {
    Element.prototype.releasePointerCapture = originalRelease;
  });

  it('completes pointerup even when releasePointerCapture throws NotFoundError', async () => {
    // Real-world quirk: implicit pointer capture can be released by the
    // browser (pointercancel) or by React reconciliation between
    // pointerdown and pointerup. In that case releasePointerCapture throws
    // NotFoundError. Before this guard the throw aborted the handler before
    // dragRef was cleared and before emitChange fired, so the dragged
    // object followed the cursor forever after the user let go.
    //
    // We assert by spying on the onChange callback: it only fires after the
    // handler completes past the release call, so a missing call signals the
    // bug. We can't assert via subsequent pointermove because React 19's
    // event system silently aborts further dispatch after a synchronous
    // throw in a handler — that masks the on-screen symptom in jsdom.
    Element.prototype.releasePointerCapture = vi.fn().mockImplementation(() => {
      throw new DOMException('No active pointer', 'NotFoundError');
    });

    const onChange = vi.fn();
    const { container } = render(
      <PageEditor svg={TEST_SVG} onChange={onChange} />
    );
    await tick();

    const rect = container.querySelector('[data-edit-id]');
    if (!rect) throw new Error('PageEditor did not assign edit ids');

    fire(rect, 'pointerdown', {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      buttons: 1,
      isPrimary: true,
    });
    // Move past DRAG_THRESHOLD_PX so drag.moved flips and pointerup will
    // attempt emitChange after releasing capture.
    fire(rect, 'pointermove', {
      clientX: 260,
      clientY: 220,
      pointerId: 1,
      buttons: 1,
      isPrimary: true,
    });
    fire(rect, 'pointerup', {
      clientX: 260,
      clientY: 220,
      pointerId: 1,
      buttons: 0,
      isPrimary: true,
    });

    expect(onChange).toHaveBeenCalled();
  });
});
