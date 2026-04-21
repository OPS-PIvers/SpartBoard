import '@testing-library/jest-dom';
import { vi } from 'vitest';
import '../i18n'; // Initialise i18next with English translations for all tests

vi.stubEnv('VITE_FIREBASE_API_KEY', '');

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

// Mock ResizeObserver — jsdom does not implement it
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

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
// Globally mock useDialog so components using it don't need DialogProvider in tests
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

// Globally mock Firebase config to avoid initializing the real SDK in tests
vi.mock('@/config/firebase', () => {
  const app = {};
  const db = {};
  const storage = {};
  const functions = {};
  const auth = {
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
  };
  return {
    isConfigured: false,
    isAuthBypass: false,
    app,
    db,
    auth,
    storage,
    functions,
    GOOGLE_OAUTH_SCOPES: [] as string[],
    googleProvider: {},
  };
});
