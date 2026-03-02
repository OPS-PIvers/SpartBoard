import '@testing-library/jest-dom';
import { vi } from 'vitest';
import '../i18n'; // Initialise i18next with English translations for all tests

// Mock PointerEvent globally since JSDOM doesn't fully support it
class MockPointerEvent extends Event {
  clientX: number;
  clientY: number;
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, { bubbles: true, ...props });
    this.clientX = props.clientX ?? 0;
    this.clientY = props.clientY ?? 0;
    this.pointerId = props.pointerId ?? 1;
  }
}
window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;

// Mock Pointer Capture methods
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn();

// Mock Canvas getContext
// eslint-disable-next-line @typescript-eslint/no-explicit-any
HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string): any => {
  if (contextId === '2d') {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      canvas: {
        width: 800,
        height: 600,
      },
    };
  }
  return null;
});
