// Typed factories for the jsdom/vitest browser-API mocks that several test
// files would otherwise re-create inline with `as any` / `@ts-expect-error`
// casts. Keeping the (genuinely unavoidable) casts in one place means the call
// sites stay suppression-free and the mock shapes only have to be maintained
// once.
//
// Playwright-side mocks (which can't depend on vitest) live in `./e2eMocks`.

import { vi } from 'vitest';

/**
 * A PointerEvent stand-in for jsdom, which does not implement `PointerEvent`.
 * Extends `Event` and assigns `clientX`/`clientY` by hand: jsdom drops those
 * coordinates when they're passed through a `MouseEvent` init dict, and the
 * drag widgets read them off the event to compute movement deltas. Events
 * bubble by default to match how the browser dispatches pointer interactions.
 */
class MockPointerEvent extends Event {
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;

  constructor(type: string, props: PointerEventInit = {}) {
    super(type, { bubbles: true, ...props });
    this.clientX = props.clientX ?? 0;
    this.clientY = props.clientY ?? 0;
    this.pointerId = props.pointerId ?? 1;
    this.pointerType = props.pointerType ?? 'mouse';
  }
}

/**
 * Returns the jsdom `PointerEvent` polyfill class, typed as the global
 * `PointerEvent` constructor so it can be assigned to `window.PointerEvent` /
 * `global.PointerEvent` without a cast at the call site.
 *
 * The double-cast through `unknown` is the one unavoidable seam: our subclass
 * structurally satisfies `PointerEvent` for test purposes but TypeScript can't
 * prove the full lib.dom surface, so we narrow it here, once.
 */
export function mockPointerEvent(): typeof PointerEvent {
  return MockPointerEvent as unknown as typeof PointerEvent;
}

/**
 * Minimal `CanvasRenderingContext2D` stub returned by a mocked
 * `HTMLCanvasElement.prototype.getContext('2d')`. Covers the 2D calls the
 * widgets (notably DrawingWidget's selection chrome) make during paint.
 */
function mock2dContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    ellipse: vi.fn(),
    fillText: vi.fn(),
    // Selection chrome (DrawingWidget) calls these — without stubs, any
    // test that mounts a DrawingWidget with a selected object would throw
    // when the canvas paint runs.
    setLineDash: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    canvas: {
      width: 800,
      height: 600,
    },
  };
}

/**
 * Returns a `vi.fn()` suitable for `HTMLCanvasElement.prototype.getContext`,
 * yielding the 2D stub for `'2d'` and `null` otherwise. Typed as the real
 * `getContext` signature so assigning it onto the prototype needs no cast and
 * no `any` at the call site; the overload-collapse is narrowed here, once.
 */
export function mockCanvasGetContext(): typeof HTMLCanvasElement.prototype.getContext {
  const getContext = vi.fn((contextId: string) =>
    contextId === '2d' ? mock2dContext() : null
  );
  return getContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
