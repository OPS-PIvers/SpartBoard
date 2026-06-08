// TZ pinning for deterministic Date formatting lives in ./setTz.ts, which is
// loaded as the first setupFile in vitest.config.ts. It must be a separate
// file because ESM import statements in this file would be hoisted above any
// top-level TZ assignment here.
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import '../i18n'; // Initialise i18next with English translations for all tests
import { mockPointerEvent, mockCanvasGetContext } from './testHelpers/mocks';

vi.stubEnv('VITE_FIREBASE_API_KEY', '');

// Mock PointerEvent globally since JSDOM doesn't fully support it
window.PointerEvent = mockPointerEvent();

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
HTMLCanvasElement.prototype.getContext = mockCanvasGetContext();
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
    // Student-app entry components await this before checking
    // `auth.currentUser` so they don't race Firebase Auth's IndexedDB
    // hydration. Resolve immediately under test — individual tests that
    // need to model the race override this in their local `mockAuth`.
    authStateReady: vi.fn().mockResolvedValue(undefined),
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
