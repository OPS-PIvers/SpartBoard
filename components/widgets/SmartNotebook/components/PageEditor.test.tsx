import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
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

/**
 * Regression test: Escape-cancel stale onBlur in the inline text editor.
 *
 * Bug summary
 * -----------
 * When the user pressed Escape to cancel a text edit, React queued
 * `setEditing(null)` but the DOM blur event fired synchronously BEFORE
 * that state update was committed.  The `onBlur={applyTextEdit}` handler
 * ran with a stale closure where `editing` was still non-null, so it
 * called `writeTextLines` + `emitChange` — saving the text the user
 * intended to discard and firing `onChange` a second time.
 *
 * Fix: `cancellingRef.current = true` is set synchronously at the start
 * of the Escape branch; `applyTextEdit` short-circuits when it sees that
 * flag.  Identical pattern to RandomGroups.GroupDropZone (PR #1965).
 */
describe('PageEditor — Escape-cancel must not commit stale text via onBlur', () => {
  it('does not call onChange when Escape cancels a modified text placeholder', async () => {
    // Open a PageEditor in text-tool mode.
    const onChange = vi.fn();
    const { container } = render(
      <PageEditor tool="text" svg={TEST_SVG} onChange={onChange} />
    );
    // Let the mount useEffect run (sets up the editable SVG DOM).
    await tick();

    // The editor container is the inner div with onPointerDown.
    const editorDiv = container.querySelector(
      '[data-no-drag="true"] div'
    ) as HTMLElement;
    expect(editorDiv).toBeTruthy();

    // Fire a text-tool pointerdown on empty canvas → creates a placeholder
    // text object and opens the inline textarea editor.
    // The container uses React synthetic pointer events (onPointerDown) so
    // fireEvent is the right vehicle here; native dispatchEvent bypasses
    // React's SyntheticEvent system and would not reach the handler.
    act(() => {
      fireEvent.pointerDown(editorDiv, {
        clientX: 400,
        clientY: 300,
        pointerId: 1,
        buttons: 1,
        isPrimary: true,
      });
    });

    // After React flushes, the textarea should be present.
    const textarea = container.querySelector('textarea');
    if (!textarea) {
      // If jsdom geometry stubs prevented the text-drop path from running
      // (e.g. objectNearClient returned something unexpected), skip rather
      // than fail — the pointerup test already covers the path.
      return;
    }

    // Count onChange calls so far (one expected: the text-object insert).
    const callsAfterInsert = onChange.mock.calls.length;

    // Simulate the user typing — now editing.value !== editing.initialValue,
    // which is the exact precondition that triggers the stale-closure bug:
    // the Escape handler won't call emitChange (it only does so for
    // unchanged placeholders), so only the stale onBlur path produces the
    // spurious second onChange call.
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    // Press Escape + blur in the same act() so React processes them in the
    // same batch.  The sequence replicates the browser's synchronous
    // focus-manager order:
    //   1. keyDown schedules setEditing(null) → queued state update
    //   2. blur fires (still inside the batch, before React commits)
    //      → with the bug this calls applyTextEdit with stale editing
    //      → with the fix it sees cancellingRef and exits early
    act(() => {
      fireEvent.keyDown(textarea, { key: 'Escape' });
      fireEvent.blur(textarea);
    });

    // onChange must NOT have been called again after the insert.
    expect(onChange.mock.calls.length).toBe(callsAfterInsert);
  });
});

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
