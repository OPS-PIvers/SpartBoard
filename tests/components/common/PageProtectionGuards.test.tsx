import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageProtectionGuards } from '@/components/common/PageProtectionGuards';
import {
  isHandedOff,
  popOutUrl,
  resetHandOffForTests,
} from '@/utils/attemptHandOff';

const OFF = { blockClipboard: false, blockPrint: false, fullscreen: false };

let fullscreenElement: Element | null = null;
let requestFullscreen: ReturnType<typeof vi.fn<() => Promise<void>>>;
let exitFullscreen: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  requestFullscreen = vi.fn<() => Promise<void>>(() => {
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  exitFullscreen = vi.fn<() => Promise<void>>(() => {
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  document.documentElement.requestFullscreen = requestFullscreen;
  document.exitFullscreen = exitFullscreen;
});

afterEach(() => {
  resetHandOffForTests();
  vi.restoreAllMocks();
  document
    .querySelectorAll('style[data-print-block]')
    .forEach((s) => s.remove());
});

const leaveFullscreen = () =>
  act(() => {
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });

describe('PageProtectionGuards print block', () => {
  it('hides the page from print and swallows Ctrl+P only while on', () => {
    const { rerender } = render(
      <PageProtectionGuards protections={{ ...OFF, blockPrint: true }} />
    );
    expect(document.querySelector('style[data-print-block]')).not.toBeNull();
    const event = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    rerender(<PageProtectionGuards protections={OFF} />);
    expect(document.querySelector('style[data-print-block]')).toBeNull();
    const after = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe('PageProtectionGuards clipboard block', () => {
  it('blocks paste on the whole page only with wholePage', () => {
    const { rerender } = render(
      <PageProtectionGuards protections={{ ...OFF, blockClipboard: true }} />
    );
    const first = new Event('paste', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(false);

    rerender(
      <PageProtectionGuards
        protections={{ ...OFF, blockClipboard: true }}
        wholePage
      />
    );
    const second = new Event('paste', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
  });
});

describe('FullscreenCover', () => {
  it('covers the page until Start opens fullscreen, then asks to return', async () => {
    render(<PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />);
    expect(screen.getByText('This activity uses fullscreen')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });
    expect(requestFullscreen).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    leaveFullscreen();
    expect(
      screen.getByRole('button', { name: 'Return to fullscreen' })
    ).toBeTruthy();
  });

  it('is skipped where the device has no fullscreen', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => false,
    });
    render(<PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves the fullscreen it opened once no longer required', async () => {
    const { rerender } = render(
      <PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });
    rerender(<PageProtectionGuards protections={OFF} />);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('shows a retry line when the browser refuses', async () => {
    document.documentElement.requestFullscreen = vi.fn<() => Promise<void>>(
      () => Promise.reject(new Error('denied'))
    );
    render(<PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });
    expect(screen.getByText("Fullscreen didn't open. Try again.")).toBeTruthy();
  });

  it('sends a framed page without fullscreen to a new tab and hands off', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => false,
    });
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue({ opener: window } as unknown as Window);
    render(<PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />);
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Open in a new tab' })
      );
    });
    expect(open).toHaveBeenCalledWith(window.location.href, '_blank');
    expect(isHandedOff()).toBe(true);
    expect(
      screen.getByRole('dialog', {
        name: 'This activity is open in another tab',
      })
    ).toBeTruthy();
  });

  it('stays put and says so when the new tab is blocked', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => false,
    });
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(<PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />);
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Open in a new tab' })
      );
    });
    expect(isHandedOff()).toBe(false);
    expect(
      screen.getByText("The new tab didn't open. Try again.")
    ).toBeTruthy();
  });

  it('shows nothing on a top-level page that cannot go fullscreen', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => false,
    });
    const { container } = render(
      <PageProtectionGuards protections={{ ...OFF, fullscreen: true }} />
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('popOutUrl', () => {
  it('leaves Schoology and Classroom launches to the host page pop out', () => {
    for (const path of [
      '/lti/student?lc=abc&code=QZ12',
      '/classroom-addon/student?code=Q',
    ]) {
      const loc = new URL(
        `https://spartboard.web.app${path}`
      ) as unknown as Location;
      expect(popOutUrl(loc)).toBeNull();
    }
  });

  it('keeps any other address', () => {
    const loc = new URL(
      'https://spartboard.web.app/flashcards/a/xyz'
    ) as unknown as Location;
    expect(popOutUrl(loc)).toBe('https://spartboard.web.app/flashcards/a/xyz');
  });
});
