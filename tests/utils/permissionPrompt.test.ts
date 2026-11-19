import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PERMISSION_PROMPT_MAX_MS,
  PERMISSION_PROMPT_TAIL_MS,
  beginMicPermissionPrompt,
  beginPermissionPrompt,
  isPermissionPromptOpen,
  resetPermissionPromptForTests,
  subscribePermissionPrompt,
  withMicPermissionPrompt,
} from '@/utils/permissionPrompt';

let hasFocus = true;
let micState: PermissionState = 'prompt';

describe('permissionPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hasFocus = true;
    micState = 'prompt';
    vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: () => Promise.resolve({ state: micState }),
      },
    });
  });
  afterEach(() => {
    resetPermissionPromptForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens on request and closes when focus comes back', () => {
    const changes = vi.fn();
    subscribePermissionPrompt(changes);
    beginPermissionPrompt();
    expect(isPermissionPromptOpen()).toBe(true);
    window.dispatchEvent(new Event('focus'));
    expect(isPermissionPromptOpen()).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('closes at the cap', () => {
    beginPermissionPrompt();
    vi.advanceTimersByTime(PERMISSION_PROMPT_MAX_MS - 1);
    expect(isPermissionPromptOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isPermissionPromptOpen()).toBe(false);
  });

  it('closes a short tail after the request settles', () => {
    const end = beginPermissionPrompt();
    end();
    vi.advanceTimersByTime(PERMISSION_PROMPT_TAIL_MS - 1);
    expect(isPermissionPromptOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isPermissionPromptOpen()).toBe(false);
  });

  it('does not open while focus is already away', () => {
    hasFocus = false;
    beginPermissionPrompt();
    expect(isPermissionPromptOpen()).toBe(false);
  });

  it('settles at once when the mic already has an answer', async () => {
    micState = 'granted';
    beginMicPermissionPrompt();
    await vi.advanceTimersByTimeAsync(PERMISSION_PROMPT_TAIL_MS);
    expect(isPermissionPromptOpen()).toBe(false);
  });

  it('stays open while the browser may still ask', async () => {
    beginMicPermissionPrompt();
    await vi.advanceTimersByTimeAsync(PERMISSION_PROMPT_TAIL_MS);
    expect(isPermissionPromptOpen()).toBe(true);
  });

  it('settles when the wrapped request finishes', async () => {
    let resolve: (v: string) => void = () => undefined;
    const pending = withMicPermissionPrompt(
      () => new Promise<string>((r) => (resolve = r))
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(isPermissionPromptOpen()).toBe(true);
    resolve('stream');
    await expect(pending).resolves.toBe('stream');
    await vi.advanceTimersByTimeAsync(PERMISSION_PROMPT_TAIL_MS);
    expect(isPermissionPromptOpen()).toBe(false);
  });

  it('shares one grace budget across requests on the page', () => {
    beginPermissionPrompt();
    vi.advanceTimersByTime(10_000);
    window.dispatchEvent(new Event('focus'));
    beginPermissionPrompt();
    vi.advanceTimersByTime(PERMISSION_PROMPT_MAX_MS - 10_000);
    expect(isPermissionPromptOpen()).toBe(false);
    beginPermissionPrompt();
    expect(isPermissionPromptOpen()).toBe(false);
  });

  it('does not extend an open window on a second request', () => {
    beginPermissionPrompt();
    vi.advanceTimersByTime(10_000);
    beginPermissionPrompt();
    vi.advanceTimersByTime(PERMISSION_PROMPT_MAX_MS - 10_000);
    expect(isPermissionPromptOpen()).toBe(false);
  });
});
