import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { useAuth } from '@/context/useAuth';

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as Mock;

/** Set up global gapi mock that immediately resolves the picker load. */
function setupGapiMock() {
  (globalThis as Record<string, unknown>).gapi = {
    load: vi.fn(
      (_api: string, config: { callback: () => void; onerror: () => void }) => {
        config.callback();
      }
    ),
  };
}

/**
 * Set up the google.picker global namespace with constructable mocks.
 * DocsView and PickerBuilder are used with `new` in the hook, so they must
 * be real constructor functions (not arrow-function vi.fn mocks).
 */
function setupPickerMock(
  action: 'picked' | 'cancel',
  fileData?: { id: string; name: string; mimeType: string }
) {
  // Chain helper — returns an object whose every method returns itself
  function chainable(): Record<string, Mock> {
    const obj: Record<string, Mock> = {};
    const methods = [
      'setIncludeFolders',
      'setMimeTypes',
      'setMode',
      'addView',
      'setOAuthToken',
      'setMaxItems',
      'setTitle',
      'setDeveloperKey',
      'setAppId',
    ];
    for (const m of methods) {
      obj[m] = vi.fn().mockReturnValue(obj);
    }
    return obj;
  }

  const docsViewInstance = chainable();
  const builderInstance = chainable();

  // setCallback captures the picker response callback, build().setVisible() invokes it
  builderInstance.setCallback = vi.fn().mockImplementation(function (
    this: typeof builderInstance,
    cb: (r: Record<string, unknown>) => void
  ) {
    builderInstance._cb = cb as unknown as Mock;
    return builderInstance;
  });

  builderInstance.build = vi.fn().mockReturnValue({
    setVisible: vi.fn().mockImplementation(() => {
      const response: Record<string, unknown> = { action };
      if (action === 'picked' && fileData) {
        response.docs = [fileData];
      }
      (builderInstance._cb as unknown as (r: Record<string, unknown>) => void)(
        response
      );
    }),
  });

  (globalThis as Record<string, unknown>).google = {
    picker: {
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      Response: { ACTION: 'action', DOCUMENTS: 'docs' },
      Document: { ID: 'id', NAME: 'name', MIME_TYPE: 'mimeType' },
      ViewId: { DOCS: 'docs' },
      DocsViewMode: { LIST: 'list' },
      // Must use function() — not arrow — so `new` works
      DocsView: function DocsView() {
        return docsViewInstance;
      },
      PickerBuilder: function PickerBuilder() {
        return builderInstance;
      },
    },
  };
}

describe('useGooglePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    mockUseAuth.mockReturnValue({ googleAccessToken: 'fake-token' });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).gapi;
    delete (globalThis as Record<string, unknown>).google;
    document
      .querySelectorAll('script[src*="apis.google.com"]')
      .forEach((el) => el.remove());
  });

  it('rejects when Google Drive is not connected', async () => {
    mockUseAuth.mockReturnValue({ googleAccessToken: null });
    const { useGooglePicker } = await import('@/hooks/useGooglePicker');
    const { result } = renderHook(() => useGooglePicker());

    expect(result.current.isConnected).toBe(false);
    await expect(result.current.openPicker()).rejects.toThrow(
      'Google Drive is not connected'
    );
  });

  it('returns null on concurrent invocation', async () => {
    setupGapiMock();
    setupPickerMock('picked', {
      id: 'doc-1',
      name: 'Test',
      mimeType: 'text/plain',
    });
    const { useGooglePicker } = await import('@/hooks/useGooglePicker');
    const { result } = renderHook(() => useGooglePicker());

    await vi.advanceTimersByTimeAsync(300);

    // First call opens the picker (it resolves immediately via our mock)
    const first = result.current.openPicker();
    // Second call while first is "active" should resolve null
    const second = await result.current.openPicker();
    expect(second).toBeNull();

    await first;
  });

  it('rejects when gapi script fails to load within timeout', async () => {
    // Do NOT set up gapi — simulate script never loading
    const { useGooglePicker } = await import('@/hooks/useGooglePicker');
    const { result } = renderHook(() => useGooglePicker());

    const promise = result.current.openPicker();
    // Attach the rejection handler BEFORE advancing timers to prevent
    // the "unhandled rejection" warning that occurs when the promise
    // rejects during advanceTimersByTimeAsync before a handler exists.
    const assertion = expect(promise).rejects.toThrow(
      'Google API script failed to load'
    );
    await vi.advanceTimersByTimeAsync(16_000);
    await assertion;
    vi.clearAllTimers();
  });

  it('returns null when user cancels picker', async () => {
    setupGapiMock();
    setupPickerMock('cancel');
    const { useGooglePicker } = await import('@/hooks/useGooglePicker');
    const { result } = renderHook(() => useGooglePicker());

    await vi.advanceTimersByTimeAsync(300);
    const file = await result.current.openPicker();
    expect(file).toBeNull();
  });

  it('returns picked file metadata on successful pick', async () => {
    setupGapiMock();
    setupPickerMock('picked', {
      id: 'doc-123',
      name: 'My Document',
      mimeType: 'application/vnd.google-apps.document',
    });
    const { useGooglePicker } = await import('@/hooks/useGooglePicker');
    const { result } = renderHook(() => useGooglePicker());

    await vi.advanceTimersByTimeAsync(300);
    const file = await result.current.openPicker();
    expect(file).toEqual({
      id: 'doc-123',
      name: 'My Document',
      mimeType: 'application/vnd.google-apps.document',
    });
  });

  it('dynamically injects gapi script tag when picker is opened', async () => {
    setupGapiMock();
    setupPickerMock('cancel');
    const { useGooglePicker } = await import('@/hooks/useGooglePicker');
    const { result } = renderHook(() => useGooglePicker());

    expect(
      document.querySelector('script[src*="apis.google.com/js/api.js"]')
    ).toBeNull();

    const promise = result.current.openPicker();
    expect(
      document.querySelector('script[src*="apis.google.com/js/api.js"]')
    ).not.toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    await promise;
  });
});
