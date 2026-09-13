import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEphemeralAppLanguage } from './useEphemeralAppLanguage';

vi.mock('@/i18n', () => ({
  default: { language: 'en', changeLanguage: vi.fn() },
  SUPPORTED_LANGUAGES: [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  ],
}));

const i18nMock = (await import('@/i18n')).default as unknown as {
  language: string;
  changeLanguage: ReturnType<typeof vi.fn>;
};
const changeLanguage = i18nMock.changeLanguage;

/** Deferred promise so a switch can be observed mid-flight. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  changeLanguage.mockReset();
  i18nMock.language = 'en';
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useEphemeralAppLanguage', () => {
  it('switches on mount and reverts on unmount', () => {
    changeLanguage.mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useEphemeralAppLanguage('es'));
    expect(changeLanguage).toHaveBeenCalledWith('es');
    unmount();
    expect(changeLanguage).toHaveBeenLastCalledWith('en');
  });

  it('does nothing for a locale the app shell does not ship', () => {
    renderHook(() => useEphemeralAppLanguage('so'));
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it('re-reverts when the unmount races an in-flight switch', async () => {
    const first = deferred();
    changeLanguage.mockImplementationOnce(() => first.promise);
    changeLanguage.mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useEphemeralAppLanguage('es'));
    unmount();
    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(changeLanguage.mock.calls.filter((c) => c[0] === 'en')).toHaveLength(
      2
    );
  });

  it('restores the previous spart_language value', async () => {
    localStorage.setItem('spart_language', 'de');
    changeLanguage.mockImplementation(() => {
      localStorage.setItem('spart_language', 'es');
      return Promise.resolve();
    });
    const { unmount } = renderHook(() => useEphemeralAppLanguage('es'));
    await Promise.resolve();
    expect(localStorage.getItem('spart_language')).toBe('de');
    unmount();
    await Promise.resolve();
    expect(localStorage.getItem('spart_language')).toBe('de');
  });

  it('clears the key when nothing was stored before', async () => {
    changeLanguage.mockImplementation(() => {
      localStorage.setItem('spart_language', 'es');
      return Promise.resolve();
    });
    renderHook(() => useEphemeralAppLanguage('es'));
    await Promise.resolve();
    expect(localStorage.getItem('spart_language')).toBeNull();
  });

  it('restores spart_language after the cancelled-race revert', async () => {
    localStorage.setItem('spart_language', 'de');
    const first = deferred();
    changeLanguage.mockImplementationOnce(() => {
      localStorage.setItem('spart_language', 'es');
      return first.promise;
    });
    changeLanguage.mockImplementation(() => {
      localStorage.setItem('spart_language', 'en');
      return Promise.resolve();
    });
    const { unmount } = renderHook(() => useEphemeralAppLanguage('es'));
    unmount();
    first.resolve();
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(localStorage.getItem('spart_language')).toBe('de');
  });
});
