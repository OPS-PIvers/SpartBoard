import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { flushSync } from 'react-dom';
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
    // Fail loudly rather than silently passing — a phantom green would give
    // false confidence that the cancellingRef guard is being exercised.
    expect(textarea).not.toBeNull();
    if (!textarea) return; // TypeScript narrowing only; assertion above already fails

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

/**
 * Regression test: onChange ref must be current immediately after a
 * synchronous re-render (flushSync), not deferred to the next passive-effect
 * flush.
 *
 * Bug (fixed)
 * -----------
 * The original code used `useEffect(() => { onChangeRef.current = onChange; })`
 * (no dep array — fires after every render). Between the render commit and the
 * passive-effect flush there is a window where `onChangeRef.current` still
 * holds the PREVIOUS render's callback. In production this window is open for
 * at least one browser paint frame (~16 ms). Any synchronous call into the
 * editor during that window — e.g. a native window keydown handler invoking
 * `undo()` → `onChangeRef.current?.(prev)` — would silently call the stale
 * callback and miss the current one.
 *
 * Fix: assign refs in the render body so the ref is always current by the time
 * any handler fires. CLAUDE.md: "Assign refs directly in the render body —
 * no effect needed."
 *
 * Test strategy
 * -------------
 * 1. Render with onChange=fnA, make a drag edit (populates the undo stack and
 *    calls fnA once via emitChange).
 * 2. `flushSync(rerender with onChange=fnB)` — commits synchronously, but
 *    passive effects are NOT flushed (flushSync only runs layout effects).
 * 3. Dispatch a native `window` keydown Ctrl+Z — the capture-phase listener
 *    registered in the previous useEffect is still active. It calls `undo()`
 *    which calls `onChangeRef.current?.(prev)` synchronously.
 *    • Old code: `onChangeRef.current === fnA` (stale; effect hasn't fired) → FAIL
 *    • New code: `onChangeRef.current === fnB` (render-body update ran) → PASS
 *
 * Why this works in the test environment
 * ----------------------------------------
 * `flushSync` commits the React tree (runs synchronous render + layout
 * effects) but deliberately does NOT drain the passive-effect queue.
 * `window.dispatchEvent` fires synchronously — no act(), no timer, nothing
 * that could accidentally flush effects before the assertion.
 */
describe('PageEditor — onChange ref is current immediately after flushSync re-render', () => {
  it('Ctrl+Z calls the NEW onChange after a flushSync prop swap, not the pre-swap one', async () => {
    const fnA = vi.fn();
    const fnB = vi.fn();

    // Render in default select-mode so no textarea opens (editing stays null,
    // which is required for the keydown handler to reach the undo branch).
    const { container, rerender } = render(
      <PageEditor svg={TEST_SVG} onChange={fnA} />
    );
    // Let the mount useEffect run (sets up the editable SVG DOM and records
    // initialSvgRef — required for emitChange to push onto the undo stack).
    await tick();

    const rect = container.querySelector('[data-edit-id]');
    if (!rect)
      throw new Error(
        'PageEditor did not assign edit ids to foreground objects'
      );

    // Drag the rect past DRAG_THRESHOLD_PX so the pointerup handler calls
    // emitChange() → onChangeRef.current(serialized). This:
    //   (a) calls fnA once, and
    //   (b) pushes the pre-drag SVG baseline onto pastSvgStackRef
    //       (required for undo() to have something to pop).
    fire(rect, 'pointerdown', {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      buttons: 1,
      isPrimary: true,
    });
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

    // fnA must have been called (confirms emitChange ran and undo stack is set).
    expect(fnA).toHaveBeenCalled();
    fnA.mockClear();
    fnB.mockClear();

    // Swap to fnB via flushSync: commits the React tree (layout effects run)
    // but does NOT flush passive effects. With the old useEffect-based ref
    // sync, `onChangeRef.current` still equals fnA at this point.
    // With the render-body fix it already equals fnB.
    flushSync(() => {
      rerender(<PageEditor svg={TEST_SVG} onChange={fnB} />);
    });

    // Dispatch a native capture-phase keydown on window.
    // • This bypasses React's synthetic event system and act() entirely.
    // • The listener registered during the previous useEffect is still active.
    // • It is synchronous: no scheduler, no microtask, no effect flush.
    // • The listener calls undo() → onChangeRef.current?.(prev).
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    // Old code (useEffect ref sync): passive effect hasn't run → fnA called → FAIL
    // New code (render-body ref sync): ref updated during flushSync → fnB called → PASS
    expect(fnB).toHaveBeenCalled();
    expect(fnA).not.toHaveBeenCalled();
  });
});
